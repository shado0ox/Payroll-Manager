import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const files=[];
const walk=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())walk(file);
  else if(file.endsWith('.mjs')&&!file.endsWith('.test.mjs'))files.push(file);
}};
walk('server');
const config=ts.readConfigFile('tsconfig.json',ts.sys.readFile);
if(config.error)throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText,'\n'));
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,'.');
const program=ts.createProgram(files,{...parsed.options,allowJs:true,checkJs:true,noEmit:true});
const errors=ts.getPreEmitDiagnostics(program).filter(error=>[2304,2552].includes(error.code)&&error.file&&error.file.fileName.includes('/server/'));
for(const error of errors){const position=error.file.getLineAndCharacterOfPosition(error.start||0);
  console.error(`${error.file.fileName}:${position.line+1}:${position.character+1}: ${ts.flattenDiagnosticMessageText(error.messageText,' ')}`);
}
if(errors.length)process.exitCode=1;
else console.log(`Server identifier check passed (${files.length} JavaScript modules).`);
