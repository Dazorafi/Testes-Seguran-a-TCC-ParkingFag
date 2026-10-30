$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('parking-deploy-test-' + [guid]::NewGuid().ToString('N'))
$source = Join-Path $fixture 'source'
$artifacts = Join-Path $fixture 'artifacts'
$deploy = Join-Path $fixture 'deployment'
$script = Join-Path $PSScriptRoot 'deploy-local.ps1'
foreach ($name in @('orchestrador-parking-fag/scripts/run-stack.ps1','view-parking-fag/scripts/serve.mjs',
    'monitoramento-vagas/requirements.txt','monitoramento-vagas/video/estacionamento.mp4')) {
    $file = Join-Path $source $name
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file) | Out-Null
    Set-Content -LiteralPath $file -Value 'fixture'
}
foreach ($name in @('java/orchestrador-parking-fag-1.0.0.jar','frontend/index.html')) {
    $file = Join-Path $artifacts $name
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $file) | Out-Null
    Set-Content -LiteralPath $file -Value 'fixture'
}
$options = @{SourceRoot=$source;ArtifactRoot=$artifacts;DeployRoot=$deploy;CommitSha=('a'*40);DeploymentId='123-1';ValidateOnly=$true}
$plan = & $script @options | ConvertFrom-Json
if ($plan.commit -ne ('a'*40) -or -not $plan.release.StartsWith($deploy) -or (Test-Path -LiteralPath $deploy)) { throw 'Plano valido falhou ou alterou o destino.' }
function Assert-Rejected($parameters) {
    $rejected = $false
    try { & $script @parameters | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw 'Entrada insegura foi aceita.' }
}
$invalid = $options.Clone(); $invalid.CommitSha='../bad'; Assert-Rejected $invalid
$invalid = $options.Clone(); $invalid.DeploymentId='../bad'; Assert-Rejected $invalid
$invalid = $options.Clone(); $invalid.DeployRoot=Join-Path $source 'nested'; Assert-Rejected $invalid
$invalid = $options.Clone(); $invalid.ArtifactRoot=Join-Path $fixture 'missing'; Assert-Rejected $invalid
Write-Host 'PASS: plano valido sem efeitos e quatro rejeicoes de entradas invalidas.'
Write-Host "Fixtures preservadas em: $fixture"
