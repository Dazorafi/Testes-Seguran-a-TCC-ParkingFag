import pathlib,subprocess,json
p=pathlib.Path(r'C:\Users\Ti\Documents\Codex\2026-10-26\c\work\security')
repo=pathlib.Path(r'C:\Users\Ti\Desktop\GPT\TCC\orchestrador-parking-fag')
cp=';'.join([str(p/'junit-console.jar'),str(p/'java-classes'),(p/'java-classpath.txt').read_text()])
cmd=[r'D:\Eclipse Adoptium\jdk-17.0.19.10-hotspot\bin\java.exe','-cp',cp,'org.junit.platform.console.ConsoleLauncher','execute','--select-class','br.edu.fag.parking.SecurityIntegrationTest','--select-class','br.edu.fag.parking.SecurityFailClosedTest','--reports-dir',str(p/'java-reports'),'--details','tree','--disable-ansi-colors']
with (p/'java-security.log').open('w',encoding='utf-8') as out:
    r=subprocess.run(cmd,cwd=repo,stdout=out,stderr=subprocess.STDOUT)
(p/'java-exit.json').write_text(json.dumps({'exit':r.returncode,'runner':'JUnit Console 1.12.2','compiler':'Eclipse ECJ 3.42.0 (Java 17)'}))
print('JUnit exit:',r.returncode)
print((p/'java-security.log').read_text(encoding='utf-8')[-9000:])
