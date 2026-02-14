// From https://stackoverflow.com/questions/13405129/create-and-save-a-file-with-javascript
export const download = (data: string, filename: string, type: string): void => {
  const file = new Blob([data], {type: type});
  const a = document.createElement("a"),
          url = URL.createObjectURL(file);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);  
  }, 0); 
}

