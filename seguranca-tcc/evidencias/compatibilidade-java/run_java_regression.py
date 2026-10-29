import pathlib,subprocess
p=pathlib.Path(r'C:\Users\Ti\Documents\Codex\2026-10-26\c\work\security')
repo=pathlib.Path(r'C:\Users\Ti\Desktop\GPT\TCC\orchestrador-parking-fag')
cp=';'.join([str(p/'junit-console.jar'),str(p/'java-classes'),(p/'java-classpath.txt').read_text()])
cmd=[r'D:\Eclipse Adoptium\jdk-17.0.19.10-hotspot\bin\java.exe','-cp',cp,'org.junit.platform.console.ConsoleLauncher','execute']
for cls in ['ParkingIntegrationTest','ReservationTest','WebSocketIntegrationTest']:
    cmd+=['--select-class','br.edu.fag.parking.'+cls]
cmd+=['--reports-dir',str(p/'java-regression-reports'),'--details','summary','--disable-ansi-colors']
with (p/'java-regression.log').open('w',encoding='utf-8') as out:r=subprocess.run(cmd,cwd=repo,stdout=out,stderr=subprocess.STDOUT)
print('Regression exit:',r.returncode);print((p/'java-regression.log').read_text(encoding='utf-8')[-4000:])
