(* benchmark.m
   Compare uncompiled NMinimize-based RandomSearch (PrSAT.m's current path)
   against the compiled cost + hand-rolled Nelder-Mead path.

   Run: wolframscript -file benchmark.m
*)

$here = DirectoryName[$InputFileName];
Print["[bench] loading CompiledRandomSearch.m from ", $here];
Get[FileNameJoin[{$here, "CompiledRandomSearch.m"}]];

(* === Pretty number formatting that survives the no-front-end output. *)
fmt[x_?NumericQ] := ToString[NumberForm[N[x], {7, 4}], OutputForm];
fmt[x_] := ToString[x];

(* === Test problems ============================================== *)
testProblems = {
  "1var_simple"  -> {Pr[A] > 1/2},
  "2var_ineq"    -> {Pr[A] > Pr[B], Pr[A] < 3/4, Pr[B] > 1/8},
  "2var_mixed"   -> {Pr[A && B] == 1/4, Pr[A || B] > 1/2},
  "3var_chain"   -> {Pr[A] > Pr[B], Pr[B] > Pr[C], Pr[C] > 1/8, Pr[A] < 4/5},
  "3var_eqset"   -> {Pr[A] == 1/3, Pr[B] == 1/2, Pr[A && B] > 0, Pr[A && B] < 1/4},
  "4var_ineq"    -> {Pr[A] > 1/3, Pr[B] > 1/3, Pr[C] > 1/3, Pr[D] > 1/3,
                     Pr[A && B && C && D] < 1/16}
};

(* === Helper: time a thunk N times, return mean & best =========== *)
timeIt[thunk_, n_Integer:3] := Module[{ts},
  ts = Table[First[AbsoluteTiming[thunk[]]], {n}];
  <|"mean" -> Mean[ts], "best" -> Min[ts], "all" -> ts|>
];

(* === Feasibility check: re-evaluate the (now-augmented) cost at *)
(* the returned point. f<0 iff every constraint's cost term <= 0, *)
(* iff the user constraints AND probability axioms hold (modulo   *)
(* the margin/regmargin slack PrSAT uses). This is the same       *)
(* notion of "satisfied" that PrSAT.m's random-search loop uses.  *)
feasibleQ[cf_CompiledFunction, point_List] := (cf @@ point) < 0;

(* === Run one benchmark ========================================== *)
runOne[name_, constraints_] := Module[
  {bag, cf, fSym, modelvars, sysCons, initPoint,
   tSym, tCompile, tCompiled, mSym, mCompiled,
   satSym, satCompiled, feasSym, feasCompiled},

  Print["=== ", name, " ==="];
  Print["  constraints: ", InputForm[constraints]];

  bag = BuildCostExpression[constraints];
  If[bag === $Failed,
    Print["  build failed (likely UNSAT system); skipping"];
    Return[$Failed]
  ];

  fSym = bag["f"];
  modelvars = bag["modelvars"];
  sysCons = bag["sysCons"];
  initPoint = bag["initPoint"];

  Print["  modelvars dim = ", Length[modelvars],
        ", |sysCons| = ", Length[sysCons],
        ", LeafCount[f] = ", LeafCount[fSym]];

  Off[NMinimize::cvmit]; Off[NMinimize::nosat]; Off[NMinimize::incst];
  Off[NMinimize::nnum]; Off[NMinimize::nsol]; Off[NMinimize::lvar];
  Off[NMinimize::bcons]; Off[Less::nord]; Off[Greater::nord];
  Off[Power::infy]; Off[\[Infinity]::indet];

  (* PrSAT.m's current path: NMinimize random-search with f + sysCons. *)
  tSym = timeIt[
    Function[{},
      mSym = NMinimize[{fSym, And @@ sysCons}, modelvars,
        Method -> {"RandomSearch",
                   "InitialPoints" -> {initPoint},
                   "SearchPoints" -> 1}]
    ],
    3];
  satSym = NumericQ[mSym[[1]]] && mSym[[1]] < 0;

  (* Compile *)
  tCompile = First[AbsoluteTiming[
    cf = CompileCostFunction[fSym, modelvars];
  ]];
  If[Head[cf] =!= CompiledFunction,
    Print["  C compile failed; falling back to WVM"];
    tCompile = First[AbsoluteTiming[
      cf = CompileCostFunctionWVM[fSym, modelvars];
    ]];
  ];

  (* Compiled NM + rationalization (full PrSAT.m equivalent pipeline). *)
  tCompiled = timeIt[
    Function[{},
      mCompiled = CompiledRandomSearchSolve[constraints,
        "Probabilities" -> Regular,
        "SearchAttempts" -> 1,
        "Rationalize" -> True]
    ],
    3];
  satCompiled = TrueQ[mCompiled["satQ"]];

  (* Symbolic NMinimize already returns exact rationals via PrSAT's     *)
  (* outer rationalization; for our path we check satQ which means     *)
  (* both numeric AND exact verification passed.                       *)
  feasSym = feasibleQ[cf, modelvars /. mSym[[2]]];
  feasCompiled = TrueQ[mCompiled["satExact"]];

  Print["  symbolic NMinimize: mean=", fmt[tSym["mean"]],
        " s, best=", fmt[tSym["best"]],
        " s, sat=", satSym, ", verified=", feasSym];
  Print["  compiled NM:        mean=", fmt[tCompiled["mean"]],
        " s, best=", fmt[tCompiled["best"]],
        " s, sat=", satCompiled, ", verified=", feasCompiled,
        ", iters=", mCompiled["iterations"], ", evals=", mCompiled["evaluations"]];
  Print["  compile time:       ", fmt[tCompile], " s (one-time)"];
  Print["  speedup (mean):     ", fmt[tSym["mean"]/tCompiled["mean"]], "x"];
  Print["  speedup (best):     ", fmt[tSym["best"]/tCompiled["best"]], "x"];

  <|"name" -> name,
    "dim" -> Length[modelvars],
    "tSym" -> tSym["mean"], "tSymBest" -> tSym["best"], "satSym" -> satSym,
    "feasSym" -> feasSym,
    "tCompiled" -> tCompiled["mean"], "tCompiledBest" -> tCompiled["best"],
    "satCompiled" -> satCompiled, "feasCompiled" -> feasCompiled,
    "tCompile" -> tCompile,
    "speedupMean" -> tSym["mean"]/tCompiled["mean"],
    "speedupBest" -> tSym["best"]/tCompiled["best"]|>
];

(* === Run all =================================================== *)
SeedRandom[42];
results = (runOne @@@ testProblems) /. $Failed -> Nothing;

Print[];
Print["============================================================"];
Print["SUMMARY"];
Print["============================================================"];
Print[StringJoin[{
  StringPadRight["name", 16],
  StringPadLeft["dim", 5],
  StringPadLeft["sym(s)", 12],
  StringPadLeft["compiled(s)", 14],
  StringPadLeft["speedup", 14],
  StringPadLeft["compile(s)", 12],
  StringPadLeft["sym/cmp ok", 14]}]];
Print[StringRepeat["-", 87]];
Do[
  Print[StringJoin[{
    StringPadRight[r["name"], 16],
    StringPadLeft[ToString[r["dim"]], 5],
    StringPadLeft[fmt[r["tSym"]], 12],
    StringPadLeft[fmt[r["tCompiled"]], 14],
    StringPadLeft[fmt[r["speedupMean"]] <> "x", 14],
    StringPadLeft[fmt[r["tCompile"]], 12],
    StringPadLeft[ToString[r["feasSym"]] <> "/" <> ToString[r["feasCompiled"]], 14]
  }]],
  {r, results}];

If[Length[results] > 0,
  Print["[bench] geometric mean speedup: ",
    fmt[GeometricMean[results[[All, "speedupMean"]]]], "x"]
];

Print["[bench] done"];
