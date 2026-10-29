import re,pathlib,shutil,subprocess,urllib.request
p=pathlib.Path(r'C:\Users\Ti\Documents\Codex\2026-10-26\c\work\security')
repo=pathlib.Path(r'C:\Users\Ti\Desktop\GPT\TCC\orchestrador-parking-fag')
log=(p/'java-compile-debug.log').read_text(encoding='utf-8-sig')
cp=re.search(r'\(f\) testPath = \[(.+)\]',log).group(1).split(', ')
cp=[v for v in cp if v.endswith('.jar')]
(p/'java-classpath.txt').write_text(';'.join(cp),encoding='utf-8')
classes=p/'java-classes'; classes.mkdir(exist_ok=True)
for folder in ['src/main/resources','src/test/resources']:
    shutil.copytree(repo/folder,classes,dirs_exist_ok=True)
sources=[str(f) for base in ['src/main/java','src/test/java'] for f in (repo/base).rglob('*.java')]
args=['-17','-parameters','-encoding','UTF-8','-cp',';'.join(cp),'-d',str(classes),*sources]
(p/'ecj.args').write_text('\n'.join('"'+a.replace('\\','/')+'"' for a in args),encoding='utf-8')
java=r'D:\Eclipse Adoptium\jdk-17.0.19.10-hotspot\bin\java.exe'
r=subprocess.run([java,'-jar',str(p/'ecj.jar'),'@'+str(p/'ecj.args')],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace')
(p/'ecj-compile.log').write_text(r.stdout,encoding='utf-8');print('ECJ compile exit:',r.returncode);print(r.stdout[-6500:])
if r.returncode: raise SystemExit(r.returncode)
url='https://repo.maven.apache.org/maven2/org/junit/platform/junit-platform-console-standalone/1.12.2/junit-platform-console-standalone-1.12.2.jar'
if not (p/'junit-console.jar').exists():urllib.request.urlretrieve(url,p/'junit-console.jar')
