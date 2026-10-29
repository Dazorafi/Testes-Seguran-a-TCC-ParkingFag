[CmdletBinding()]
param(
    [string]$PythonExe = 'python',
    [string]$NodeExe = 'node',
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$MavenExe = '',
    [string]$MavenRepository = '',
    [string]$ReportDir = (Join-Path $PSScriptRoot 'resultados-seguranca')
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
if ($JavaHome) {
    $env:JAVA_HOME = $JavaHome
    $env:PATH = (Join-Path $JavaHome 'bin') + [IO.Path]::PathSeparator + $env:PATH
}
$backend = Join-Path $PSScriptRoot 'orchestrador-parking-fag'
$frontend = Join-Path $PSScriptRoot 'view-parking-fag'
$monitor = Join-Path $PSScriptRoot 'monitoramento-vagas'
if (-not $MavenExe) { $MavenExe = Join-Path $backend 'mvnw.cmd' }
$ReportDir = [IO.Path]::GetFullPath($ReportDir)
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
$version = & $PythonExe -c 'import sys; print("%d.%d" % sys.version_info[:2]); assert (3,12) <= sys.version_info[:2] < (3,14)'
if ($LASTEXITCODE -ne 0) { throw 'Informe -PythonExe com Python 3.12 ou 3.13 e as dependencias do monitor instaladas.' }
Write-Host "Python: $version"
& java -version
if ($LASTEXITCODE -ne 0) { throw 'Informe -JavaHome apontando para um JDK 17 ou superior.' }
$results = [System.Collections.Generic.List[object]]::new()
function Invoke-SecurityStep([string]$Name, [string]$Folder, [string]$Executable, [string[]]$CommandArgs) {
    Push-Location -LiteralPath $Folder
    try {
        Write-Host "Executando $Name"
        & $Executable @CommandArgs 2>&1 | Tee-Object -FilePath (Join-Path $ReportDir "$Name.log")
        $code = $LASTEXITCODE
        $results.Add([pscustomobject]@{ Suite = $Name; ExitCode = $code })
    } finally { Pop-Location }
}
$mavenArgs = @('-B', '-ntp', '-Dtest=SecurityIntegrationTest,SecurityFailClosedTest', 'test')
if ($MavenRepository) { $mavenArgs = @("-Dmaven.repo.local=$MavenRepository") + $mavenArgs }
Invoke-SecurityStep 'java' $backend $MavenExe $mavenArgs
Invoke-SecurityStep 'react' $frontend $NodeExe @('node_modules/vitest/vitest.mjs','run','src/test/security.test.tsx','--reporter=verbose')
Invoke-SecurityStep 'proxy' $frontend $NodeExe @('--test','--test-reporter=tap','scripts/security.test.mjs')
Invoke-SecurityStep 'python' $monitor $PythonExe @('-m','pytest','tests/test_security.py','-v',"--junitxml=$(Join-Path $ReportDir 'python.xml')")
$results | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ReportDir 'resumo.json') -Encoding UTF8
$results | Format-Table
if (@($results | Where-Object ExitCode -ne 0).Count -gt 0) {
    Write-Host 'Ha testes reprovados ou erros de execucao. Consulte os logs; falhas de seguranca nao sao ocultadas.'
    exit 1
}
exit 0
