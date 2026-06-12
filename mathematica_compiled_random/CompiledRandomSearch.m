(* CompiledRandomSearch.m
   Proof-of-concept compiled random-search solver for PrSAT 3.x (Mathematica).

   Drop-in alternative to the Method -> "Random" path in PrSAT.m (lines 939-941):
     - builds the same scalar cost function f
     - runs it through Compile[..., CompilationTarget -> "C"]
     - drives a hand-rolled Nelder-Mead loop calling the compiled cost

   Loads PrSAT.m to reuse its preprocessing helpers. Everything lives in
   Global` context so the symbols (\[CapitalOmega], Subscript[\[DoubleStruckA],
   j], Pr, NullEvent, ...) match PrSAT.m. *)

(* === Load PrSAT.m if not already loaded ============================ *)
(* Try (1) same directory as us (drop-in alongside PrSAT.m) and (2) the *)
(* cross-project experimental layout. The check is skipped entirely     *)
(* when PrSAT.m is the one Get'ing us — its helpers will already exist. *)
(* IMPORTANT: ValueQ only inspects OwnValues; PrSAT.m's helpers live in *)
(* DownValues, so we must check DownValues directly to detect prior load. *)
If[Length[DownValues[Global`CrossMultiply]] === 0,
  Module[{here = DirectoryName[$InputFileName], candidates, prsatPath},
    candidates = {
      FileNameJoin[{here, "PrSAT.m"}],
      FileNameJoin[{ParentDirectory[ParentDirectory[here]],
        "PrSAT 3.0", "PrSAT_3_Mathematica", "PrSAT.m"}]
    };
    prsatPath = SelectFirst[candidates, FileExistsQ, None];
    If[prsatPath =!= None,
      Quiet@Get[prsatPath],
      Print["[CompiledRandomSearch] PrSAT.m not found; tried: ", candidates]
    ]
  ]
];

(* === BuildCostExpression =========================================== *)
(* Replicates PrSAT.m lines 818-929 (first sol1 branch only).          *)

ClearAll[BuildCostExpression];
Options[BuildCostExpression] = {
  "Probabilities" -> Regular,
  "Margin" -> 1.*^-6,
  "RegMargin" -> 1.*^-3,
  "AtomOrdering" -> "TopToBottom",
  "Seed" -> {},
  (* "SolveEquations" -> True (default) reproduces PrSAT.m's flow: equations *)
  (* are pre-solved via Solve/Reduce and substituted in. False skips Solve   *)
  (* entirely and embeds each equality as an `(lhs-rhs)^2 - margin^2` cost   *)
  (* term — the trick the TS PrSAT 3.1 random_search.ts uses, and the only  *)
  (* viable approach for systems where Reduce blows up combinatorially.    *)
  "SolveEquations" -> True
};

BuildCostExpression[l0_, OptionsPattern[]] := Module[
  {l, eventVariables, eventSets, omega, atomsInNonNullEvents, nullEventRule,
   prc, margin, regmargin, atomordering, seed,
   sys, equations, sol1, sysIneqs,
   systemToInstantiate, sysCons, modelvars, nonmodelvars,
   f, initPoint, realonly, solveFn},

  prc = OptionValue["Probabilities"];
  margin = OptionValue["Margin"];
  regmargin = OptionValue["RegMargin"];
  atomordering = OptionValue["AtomOrdering"];
  seed = OptionValue["Seed"];
  If[seed === {}, seed = Mod[Floor[AbsoluteTime[]*1000000], 1000000]];
  SeedRandom[seed];

  l = Defns[lfix[FixedPoint[expandCondPr, l0]]];
  eventVariables = Sort[ExtractVariables[l]];
  eventSets = AssociateEventsWithAtoms[eventVariables, atomordering];
  omega = \[CapitalOmega] /. eventSets;
  atomsInNonNullEvents = Complement[omega, NullEvent /. eventSets];
  nullEventRule = ((NullEvent /. eventSets)[[1]] ->
                    1 - Plus @@ atomsInNonNullEvents) /. eventSets;

  sys = l /. eventSets //. {
    x_List && y_List :> Intersection[x, y],
    x_List || y_List :> Union[x, y],
    Not[x_List] :> Complement[omega, x]
  } //. nullEventRule;

  sys = sys //. {
    Inequality :> List,
    a_ < b_ < c__ :> a < b && b < c,
    a_ > b_ > c__ :> a > b && b > c,
    {x_, (h : Less | LessEqual | Greater | GreaterEqual), y_,
     (h2 : Less | LessEqual | Greater | GreaterEqual), z__} :> h[x, y] && {y, h2, z},
    {x_, (h : Less | LessEqual | Greater | GreaterEqual), y_} :> h[x, y]
  };

  sys = CrossMultiply[
    FixedPoint[Flatten[Replace[#, And[x_, y_] -> List[x, y], 1]] &, sys],
    prc[omega, omega, regmargin]
  ];

  equations = ExtractEquations[sys];
  realonly[x_] := !MemberQ[ExtractVariables[x] //. (x //. NonrealRule), Nonreal];
  If[OptionValue["SolveEquations"],
    (* PrSAT.m's flow: pre-solve and substitute. Fast on small systems,    *)
    (* unusable on dense polynomial systems where Reduce blows up.         *)
    Off[Solve::svars];
    solveFn[x_] := If[Head[Solve[x]] === Solve, {ToRules[Reduce[x]]}, Solve[x]];
    sol1 = If[equations =!= {},
      Select[Simplify[solveFn[equations],
        (And @@ (0 <= # <= 1 & /@ ExtractVariables[equations])) &&
        Plus @@ ExtractVariables[equations] <= 1], realonly[#] &],
      {{}}
    ];
    If[equations =!= {} && sol1 === {}, Return[$Failed]];
    sysIneqs = ExtractInequalities[sys];
    (* First solution branch only, by design. *)
    systemToInstantiate = Quiet[
      CrossMultiply[sysIneqs //. sol1[[1]], prc[omega, omega, regmargin]],
      {Infinity::indet, Power::infy}
    ],
    (* No-Solve flow: keep all constraints (equations + inequalities) in   *)
    (* the cost. Equalities become squared-difference cost terms below.    *)
    sol1 = {{}};
    sysIneqs = sys;
    systemToInstantiate = sys;
  ];
  If[MemberQ[systemToInstantiate, False], Return[$Failed]];

  If[systemToInstantiate === {True} || systemToInstantiate === {},
    f = -1.0,
    (* Decompose any chained comparisons Simplify may have produced       *)
    (* during sol1 substitution (e.g. -0.5 < x < 0.5 from sub'd ranges). *)
    systemToInstantiate = systemToInstantiate /. {
      HoldPattern[Less[a_, b_, c_, d___]] :>
        Sequence @@ Map[Less @@ # &, Partition[{a, b, c, d}, 2, 1]],
      HoldPattern[Greater[a_, b_, c_, d___]] :>
        Sequence @@ Map[Greater @@ # &, Partition[{a, b, c, d}, 2, 1]],
      HoldPattern[LessEqual[a_, b_, c_, d___]] :>
        Sequence @@ Map[LessEqual @@ # &, Partition[{a, b, c, d}, 2, 1]],
      HoldPattern[GreaterEqual[a_, b_, c_, d___]] :>
        Sequence @@ Map[GreaterEqual @@ # &, Partition[{a, b, c, d}, 2, 1]],
      HoldPattern[Inequality[x_, h1_, y_, h2_, z_]] :>
        Sequence[h1[x, y], h2[y, z]]
    };
    systemToInstantiate = systemToInstantiate /. And[xs__] :> Sequence[xs];
    systemToInstantiate = systemToInstantiate /. {
      x_ != y_ -> -((x) - (y))^2 + margin^2,
      x_ > y_ -> margin + (y) - (x),
      x_ < y_ -> margin + (x) - (y),
      x_ >= y_ -> (y) - (x),
      x_ <= y_ -> (x) - (y),
      x_ == y_ -> ((x) - (y))^2 - margin^2
    };
    (* Simplify can blow up combinatorially on dense equation systems.    *)
    (* Compile doesn't need a simplified form — it lowers any numeric     *)
    (* expression. Only run Simplify when the system is small.            *)
    If[LeafCount[systemToInstantiate] < 5000,
      systemToInstantiate = Simplify[systemToInstantiate]];
    f = (And @@ systemToInstantiate) //. {And -> Max, Or -> Min}
  ];

  sysCons = Quiet[
    Union[
      CrossMultiply[prc[atomsInNonNullEvents, omega, regmargin] //. sol1[[1]],
                    prc[omega, omega, regmargin]]
    ],
    {Infinity::indet, Power::infy}
  ];
  (* Skip Simplify on large systems — see comment on systemToInstantiate. *)
  If[LeafCount[sysCons] < 5000,
    sysCons = Quiet[Simplify[sysCons], {Infinity::indet, Power::infy}]];

  modelvars = ExtractVariables[Join[
    If[ListQ[systemToInstantiate], systemToInstantiate, {systemToInstantiate}],
    sysCons]];
  nonmodelvars = Complement[omega, modelvars];

  initPoint = Take[
    RandomModel[Length[modelvars] + Length[nonmodelvars]],
    Length[modelvars]];

  (* Embed sysCons (probability-simplex axioms) into the cost so the *)
  (* compiled NM can't escape the feasible region. *)
  f = AugmentCostWithSysCons[f, sysCons, "Margin" -> margin];

  <|
    "f" -> f,
    "sysCons" -> sysCons,
    "modelvars" -> modelvars,
    "nonmodelvars" -> nonmodelvars,
    "initPoint" -> N[initPoint],
    "sol1" -> sol1,
    "atomsInNonNullEvents" -> atomsInNonNullEvents,
    "nullEventRule" -> nullEventRule,
    "omega" -> omega,
    "eventSets" -> eventSets,
    "eventVariables" -> eventVariables,
    "seed" -> seed,
    "margin" -> margin,
    "regmargin" -> regmargin,
    (* Original constraints, kept for the rationalization/verify step. *)
    "l0" -> l0
  |>
];

(* ===================================================================== *)
(* RationalizePoint                                                       *)
(* Mirrors PrSAT.m lines 962-988. Given a float assignment for modelvars, *)
(* try Rationalize at progressively smaller `diff`, fill in nonmodelvars  *)
(* via sol1 + nullEventRule, build a PrSAT-format testmodel, and call    *)
(* Verify. Returns exact rational atom rules on success, $Failed on       *)
(* exhaustion.                                                            *)
(* ===================================================================== *)

ClearAll[RationalizePoint];
Options[RationalizePoint] = {
  "RegMargin" -> 1.*^-3,
  "MaxRationalizeIter" -> 40,
  "Probabilities" -> Regular
};

RationalizePoint[bag_, point_List, OptionsPattern[]] := Module[
  {regmargin, maxIter, l0, sol1, omega, eventSets, nullEventRule,
   eventVariables, modelvars, nonmodelvars, prc,
   diff, ratPoint, modelRulesRat, nonmodelvarvals, nonmodelvarrules,
   atomRulesAll, testmodel, l, certificate, iter = 0},

  regmargin = OptionValue["RegMargin"];
  maxIter = OptionValue["MaxRationalizeIter"];
  prc = OptionValue["Probabilities"];

  modelvars = bag["modelvars"];
  sol1 = bag["sol1"];
  omega = bag["omega"];
  eventSets = bag["eventSets"];
  nullEventRule = bag["nullEventRule"];
  eventVariables = bag["eventVariables"];
  l0 = bag["l0"];
  l = lfix[FixedPoint[expandCondPr, l0]];

  nonmodelvars = Complement[omega, modelvars];
  diff = regmargin/2;

  While[iter < maxIter,
    iter++;
    ratPoint = Rationalize[point, diff];
    modelRulesRat = MapThread[Rule, {modelvars, ratPoint}];

    (* Fill in atoms not in modelvars (null event + sol1-eliminated). *)
    nonmodelvarvals = Quiet[
      Simplify[nonmodelvars //.
        Join[{nullEventRule}, modelRulesRat, sol1[[1]]]],
      {Power::infy, Infinity::indet}];
    nonmodelvarrules = MapThread[Rule, {nonmodelvars, nonmodelvarvals}];

    atomRulesAll = Sort[Join[modelRulesRat, nonmodelvarrules]];

    testmodel = {
      Join[# -> (# /. eventSets) & /@ eventVariables,
        {\[CapitalOmega] -> omega}],
      atomRulesAll
    };

    certificate = Quiet[
      Simplify[Verify[l, testmodel, Probabilities -> prc]],
      {Power::infy, Infinity::indet}];

    If[ListQ[certificate] && Length[certificate] >= 1
       && (And @@ certificate[[1]]) === True,
      Return[<|
        "satQ" -> True,
        "atomRules" -> atomRulesAll,
        "diff" -> diff,
        "iter" -> iter,
        "testmodel" -> testmodel|>]
    ];
    diff = diff/2;
  ];
  <|"satQ" -> False, "iter" -> iter, "diff" -> diff,
    "lastAtomRules" -> atomRulesAll|>
];

(* === AugmentCostWithSysCons ======================================== *)
(* Embed sysCons (probability axioms) as additional cost terms so the   *)
(* compiled NM cannot escape the simplex. Used by both BuildCostExpression *)
(* (above) and by integration with PrSAT.m's existing prep pipeline.    *)

ClearAll[AugmentCostWithSysCons];
Options[AugmentCostWithSysCons] = {
  "Margin" -> 1.*^-6
};

AugmentCostWithSysCons[fIn_, sysCons_, OptionsPattern[]] := Module[
  {sysConsFlat, sysConsAsCost, margin, fAug, decomp},
  margin = OptionValue["Margin"];

  (* Two-pass decomposition. Putting both the chain-rules and the And     *)
  (* flattening rule in one /. silently disables the chain rules; do them *)
  (* sequentially. HoldPattern is required because Inequality auto-     *)
  (* evaluates its blank-pattern args.                                   *)
  decomp = {
    HoldPattern[Less[a_, b_, c_, d___]] :>
      Sequence @@ Map[Less @@ # &, Partition[{a, b, c, d}, 2, 1]],
    HoldPattern[Greater[a_, b_, c_, d___]] :>
      Sequence @@ Map[Greater @@ # &, Partition[{a, b, c, d}, 2, 1]],
    HoldPattern[LessEqual[a_, b_, c_, d___]] :>
      Sequence @@ Map[LessEqual @@ # &, Partition[{a, b, c, d}, 2, 1]],
    HoldPattern[GreaterEqual[a_, b_, c_, d___]] :>
      Sequence @@ Map[GreaterEqual @@ # &, Partition[{a, b, c, d}, 2, 1]],
    HoldPattern[Inequality[x_, h1_, y_, h2_, z_]] :>
      Sequence[h1[x, y], h2[y, z]]
  };
  sysConsFlat = sysCons /. decomp;
  sysConsFlat = sysConsFlat /. And[xs__] :> Sequence[xs];

  sysConsAsCost = sysConsFlat /. {
    x_ != y_ -> -((x) - (y))^2 + margin^2,
    x_ > y_ -> margin + (y) - (x),
    x_ < y_ -> margin + (x) - (y),
    x_ >= y_ -> (y) - (x),
    x_ <= y_ -> (x) - (y),
    x_ == y_ -> ((x) - (y))^2 - margin^2
  };
  sysConsAsCost = DeleteCases[sysConsAsCost,
    True | _?(NumericQ[#] && # <= 0 &)];

  fAug = If[sysConsAsCost === {},
    fIn,
    Max[fIn, Sequence @@ sysConsAsCost]];
  fAug
];

(* === CompiledRandomSearchInner ===================================== *)
(* PrSAT.m drop-in replacement for `NMinimize[{f, sysCons}, modelvars,  *)
(* Method -> "RandomSearch", ...]`. Returns {minValue, varRules} so it  *)
(* slots into PrSAT.m's existing rationalization/verify pipeline.       *)

ClearAll[CompiledRandomSearchInner];
(* Options inlined (not Join'd from NelderMead) because NelderMead is *)
(* defined later in this file; Options[NelderMead] would be {} here.  *)
Options[CompiledRandomSearchInner] = {
  "Step" -> 0.05,
  "MaxIterations" -> Automatic,
  "EarlyStopBelow" -> 0.0,
  "Tolerance" -> 1.*^-10,
  "Margin" -> 1.*^-6
};

CompiledRandomSearchInner[f_, modelvars_List, sysCons_, initPoint_List,
                          opts:OptionsPattern[]] := Module[
  {fAug, cf, result, dim, margin},
  margin = OptionValue["Margin"];
  dim = Length[modelvars];

  fAug = AugmentCostWithSysCons[f, sysCons, "Margin" -> margin];
  cf = CompileCostFunction[fAug, modelvars];
  If[Head[cf] =!= CompiledFunction,
    cf = CompileCostFunctionWVM[fAug, modelvars]];

  result = NelderMead[cf, N[initPoint],
    FilterRules[{opts}, Options[NelderMead]]];
  {result["value"], MapThread[Rule, {modelvars, result["point"]}]}
];

(* === Compile cost function ========================================= *)

ClearAll[CompileCostFunction];
CompileCostFunction[fIn_, modelvars_List] := Module[{costExpr, cf, fixed},
  fixed = fIn /. ZeroJump[z_, t_] :> If[z <= t, -1000., z];
  costExpr = N[fixed];
  cf = Quiet@Compile[
    Evaluate[{#, _Real} & /@ modelvars],
    Evaluate[costExpr],
    CompilationTarget -> "C",
    RuntimeOptions -> "Speed"
  ];
  cf
];

ClearAll[CompileCostFunctionWVM];
CompileCostFunctionWVM[fIn_, modelvars_List] := Module[{costExpr, fixed},
  fixed = fIn /. ZeroJump[z_, t_] :> If[z <= t, -1000., z];
  costExpr = N[fixed];
  Quiet@Compile[
    Evaluate[{#, _Real} & /@ modelvars],
    Evaluate[costExpr],
    RuntimeOptions -> "Speed"
  ]
];

(* === Hand-rolled Nelder-Mead (calls compiled cost) ================= *)

ClearAll[NelderMead];
Options[NelderMead] = {
  "Step" -> 0.05,
  "MaxIterations" -> Automatic,
  "EarlyStopBelow" -> 0.0,
  "Tolerance" -> 1.*^-10
};

NelderMead[cf_CompiledFunction, x0_List, OptionsPattern[]] := Module[
  {dim, simplex, fvals, alpha = 1.0, gamma = 2.0, rho = 0.5, sigma = 0.5,
   maxIter, earlyStop, step, tol, perm, centroid, worst, fworst,
   xr, fr, xe, fe, xc, fc, iter = 0, evals = 0, stop = "MaxIter"},

  dim = Length[x0];
  step = OptionValue["Step"];
  earlyStop = OptionValue["EarlyStopBelow"];
  tol = OptionValue["Tolerance"];
  maxIter = OptionValue["MaxIterations"];
  If[maxIter === Automatic, maxIter = 500*dim];

  simplex = Prepend[Table[N[x0 + step*UnitVector[dim, i]], {i, dim}], N[x0]];
  fvals = (cf @@ #) & /@ simplex;
  evals += dim + 1;

  While[iter < maxIter,
    iter++;
    perm = Ordering[fvals];
    simplex = simplex[[perm]];
    fvals = fvals[[perm]];
    If[fvals[[1]] < earlyStop, stop = "EarlyStop"; Break[]];
    If[Max[fvals] - Min[fvals] < tol, stop = "Tolerance"; Break[]];

    worst = simplex[[-1]]; fworst = fvals[[-1]];
    centroid = Mean[Most[simplex]];

    xr = centroid + alpha*(centroid - worst);
    fr = cf @@ xr; evals++;

    Which[
      fr < fvals[[1]],
        xe = centroid + gamma*(xr - centroid);
        fe = cf @@ xe; evals++;
        If[fe < fr,
          simplex[[-1]] = xe; fvals[[-1]] = fe,
          simplex[[-1]] = xr; fvals[[-1]] = fr
        ],
      fr < fvals[[-2]],
        simplex[[-1]] = xr; fvals[[-1]] = fr,
      True,
        xc = centroid + rho*(worst - centroid);
        fc = cf @@ xc; evals++;
        If[fc < fworst,
          simplex[[-1]] = xc; fvals[[-1]] = fc,
          simplex = (simplex[[1]] + sigma*(# - simplex[[1]])) & /@ simplex;
          fvals = (cf @@ #) & /@ simplex;
          evals += dim + 1;
        ]
    ]
  ];

  perm = Ordering[fvals];
  <|"value" -> fvals[[perm[[1]]]],
    "point" -> simplex[[perm[[1]]]],
    "iterations" -> iter,
    "evaluations" -> evals,
    "stop" -> stop|>
];

(* === High-level wrapper (build + compile + search + verify) ======== *)

ClearAll[CompiledRandomSearchSolve];
Options[CompiledRandomSearchSolve] = Join[
  Options[BuildCostExpression],
  Options[NelderMead],
  Options[RationalizePoint],
  {"SearchAttempts" -> 3,
   "Rationalize" -> True}
];

CompiledRandomSearchSolve[constraints_, opts:OptionsPattern[]] := Module[
  {bag, cf, attempts, attemptsRun = 0, best = $Failed,
   t0, t1, t2, t3, t4, t5,
   tBuild, tCompile, tSearch, tRat,
   doRat, ratResult = $Failed, satNumeric, satExact, prc},
  attempts = OptionValue["SearchAttempts"];
  doRat = OptionValue["Rationalize"];
  prc = OptionValue["Probabilities"];

  t0 = AbsoluteTime[];
  bag = BuildCostExpression[constraints,
    FilterRules[{opts}, Options[BuildCostExpression]]];
  t1 = AbsoluteTime[];
  If[bag === $Failed, Return[<|"satQ" -> False, "reason" -> "BuildFailed"|>]];

  t2 = AbsoluteTime[];
  cf = CompileCostFunction[bag["f"], bag["modelvars"]];
  If[Head[cf] =!= CompiledFunction,
    cf = CompileCostFunctionWVM[bag["f"], bag["modelvars"]]];
  t3 = AbsoluteTime[];

  Do[
    attemptsRun++;
    Module[{result, x0},
      x0 = If[k == 1,
        bag["initPoint"],
        N[Take[RandomModel[Length[bag["omega"]]], Length[bag["modelvars"]]]]];
      result = NelderMead[cf, x0,
        FilterRules[{opts}, Options[NelderMead]]];
      If[best === $Failed || result["value"] < best["value"], best = result];
      If[best["value"] < 0, Break[]]
    ],
    {k, attempts}
  ];
  t4 = AbsoluteTime[];
  satNumeric = (best =!= $Failed && NumericQ[best["value"]] && best["value"] < 0);

  (* Rationalize the float assignment to exact rationals and verify under  *)
  (* exact arithmetic. Mirrors PrSAT.m lines 962-988.                      *)
  If[doRat && satNumeric,
    ratResult = RationalizePoint[bag, best["point"],
      "RegMargin" -> bag["regmargin"],
      "MaxRationalizeIter" -> OptionValue["MaxRationalizeIter"],
      "Probabilities" -> prc]
  ];
  t5 = AbsoluteTime[];
  satExact = (ratResult =!= $Failed && AssociationQ[ratResult]
              && TrueQ[ratResult["satQ"]]);

  tBuild = t1 - t0;
  tCompile = t3 - t2;
  tSearch = t4 - t3;
  tRat = t5 - t4;

  <|"satQ" -> If[doRat, satExact, satNumeric],
    "satNumeric" -> satNumeric,
    "satExact" -> satExact,
    "best" -> best,
    "rationalized" -> ratResult,
    "attempts" -> attemptsRun,
    "modelvars" -> bag["modelvars"],
    "dim" -> Length[bag["modelvars"]],
    "timing" -> <|
      "build_s" -> tBuild,
      "compile_s" -> tCompile,
      "search_s" -> tSearch,
      "rationalize_s" -> tRat,
      "total_s" -> t5 - t0|>,
    "bag" -> bag|>
];
