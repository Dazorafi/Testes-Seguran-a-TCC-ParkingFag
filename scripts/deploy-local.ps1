[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SourceRoot,
    [Parameter(Mandatory)][string]$ArtifactRoot,
    [Parameter(Mandatory)][string]$DeployRoot,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{40}$')][string]$CommitSha,
    [Parameter(Mandatory)][ValidatePattern('^[0-9]+-[0-9]+$')][string]$DeploymentId,
    [switch]$ValidateOnly
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$SourceRoot = [IO.Path]::GetFullPath($SourceRoot).TrimEnd('\','/')
$ArtifactRoot = [IO.Path]::GetFullPath($ArtifactRoot).TrimEnd('\','/')
$DeployRoot = [IO.Path]::GetFullPath($DeployRoot).TrimEnd('\','/')
if ($DeployRoot -eq [IO.Path]::GetPathRoot($DeployRoot).TrimEnd('\','/')) { throw 'DeployRoot nao pode ser a raiz de um disco.' }
if ($DeployRoot.Equals($SourceRoot,[StringComparison]::OrdinalIgnoreCase) -or
    $DeployRoot.StartsWith($SourceRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
    throw 'DeployRoot deve ficar fora dos fontes.'
}
if ($env:GITHUB_WORKSPACE) {
    $checkoutRoot = [IO.Path]::GetFullPath($env:GITHUB_WORKSPACE).TrimEnd('\','/')
    if ($DeployRoot.Equals($checkoutRoot,[StringComparison]::OrdinalIgnoreCase) -or
        $DeployRoot.StartsWith($checkoutRoot + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
        throw 'DeployRoot deve ficar fora do checkout temporario do runner.'
    }
}
$release = Join-Path $DeployRoot "releases/$CommitSha-$DeploymentId"
$jar = Join-Path $ArtifactRoot 'java/orchestrador-parking-fag-1.0.0.jar'
$frontendArtifact = Join-Path $ArtifactRoot 'frontend'
$launcherRelative = 'orchestrador-parking-fag/scripts/run-stack.ps1'
foreach ($file in @($jar,(Join-Path $frontendArtifact 'index.html'),(Join-Path $SourceRoot $launcherRelative),
    (Join-Path $SourceRoot 'view-parking-fag/scripts/serve.mjs'),(Join-Path $SourceRoot 'monitoramento-vagas/requirements.txt'),
    (Join-Path $SourceRoot 'monitoramento-vagas/video/estacionamento.mp4'))) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Arquivo obrigatorio ausente: $file" }
}
$plan = [ordered]@{ commit=$CommitSha; deployment=$DeploymentId; release=$release; jar=$jar; frontend=$frontendArtifact }
if ($ValidateOnly) { $plan | ConvertTo-Json; return }

# Local configuration never comes from the repository or a PR.
$backendEnv = Join-Path $DeployRoot 'shared/backend.env'
if (-not (Test-Path -LiteralPath $backendEnv -PathType Leaf)) { throw 'Prepare shared/backend.env conforme GUIA_CICD.md antes do primeiro deploy.' }
$config = @{}
foreach ($line in Get-Content -LiteralPath $backendEnv) {
    if ($line -match '^\s*([A-Z_][A-Z0-9_]*)=(.*)$') { $config[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'") }
}
foreach ($key in @('DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD')) {
    if ([string]::IsNullOrWhiteSpace($config[$key]) -or $config[$key] -eq 'CHANGE_ME') { throw "Configure $key em shared/backend.env." }
}
foreach ($command in @('java','node','python','powershell.exe','taskkill.exe')) { Get-Command $command -ErrorAction Stop | Out-Null }
if (Test-Path -LiteralPath $release) { throw 'Esta release ja existe. Reexecute o workflow para obter outro numero de tentativa.' }
New-Item -ItemType Directory -Force -Path $release | Out-Null
foreach ($component in @('orchestrador-parking-fag','monitoramento-vagas','view-parking-fag')) {
    Copy-Item -LiteralPath (Join-Path $SourceRoot $component) -Destination $release -Recurse
}
$backend = Join-Path $release 'orchestrador-parking-fag'
$monitor = Join-Path $release 'monitoramento-vagas'
$frontend = Join-Path $release 'view-parking-fag'
New-Item -ItemType Directory -Force -Path (Join-Path $backend 'target') | Out-Null
Copy-Item -LiteralPath $jar -Destination (Join-Path $backend 'target/orchestrador-parking-fag-1.0.0.jar')
Copy-Item -LiteralPath $frontendArtifact -Destination (Join-Path $frontend 'dist') -Recurse
$publishedAt = [datetime]::UtcNow.ToString('o')
@{commit=$CommitSha;deployment=$DeploymentId;publishedAt=$publishedAt} | ConvertTo-Json |
    Set-Content -LiteralPath (Join-Path $frontend 'dist/deploy-info.json') -Encoding UTF8
$versionPage = @"
<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Versao publicada Parking FAG</title>
<h1>Versao em execucao do Parking FAG</h1><p>Commit: <code>$CommitSha</code></p>
<p>Deploy: $DeploymentId</p><p>Publicado em UTC: $publishedAt</p>
<p><a href="/totem">Abrir totem</a> | <a href="/mobile">Abrir reservas</a></p></html>
"@
Set-Content -LiteralPath (Join-Path $frontend 'dist/versao.html') -Value $versionPage -Encoding UTF8
Copy-Item -LiteralPath $backendEnv -Destination (Join-Path $backend '.env')
$monitorEnv = Join-Path $DeployRoot 'shared/monitor.env'
if (Test-Path -LiteralPath $monitorEnv) { Copy-Item -LiteralPath $monitorEnv -Destination (Join-Path $monitor '.env') }
& python -m venv (Join-Path $monitor '.venv')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar ambiente Python.' }
$python = Join-Path $monitor '.venv/Scripts/python.exe'
& $python -m pip install --disable-pip-version-check --no-cache-dir -r (Join-Path $monitor 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependencias Python.' }
& $python -m pip install --disable-pip-version-check --no-cache-dir -e $monitor --no-deps
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar monitor.' }
Push-Location -LiteralPath $monitor
try {
    & $python -m parking_monitor.main --validate-config
    if ($LASTEXITCODE -ne 0) { throw 'Configuracao do monitor invalida.' }
} finally { Pop-Location }

$stateFile = Join-Path $DeployRoot 'current.json'
$previous = if (Test-Path -LiteralPath $stateFile) { Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } else { $null }
function Stop-OwnedStack($state) {
    if (-not $state) { return }
    $knownRelease = [IO.Path]::GetFullPath([string]$state.release)
    if (-not $knownRelease.StartsWith((Join-Path $DeployRoot 'releases') + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
        throw 'Registro de processo aponta para fora das releases.'
    }
    $process = Get-Process -Id ([int]$state.launcherId) -ErrorAction SilentlyContinue
    if (-not $process) { return }
    if ($process.ProcessName -ne 'powershell' -or
        [Math]::Abs(($process.StartTime.ToUniversalTime() - ([datetime]$state.started).ToUniversalTime()).TotalMilliseconds) -ge 2) {
        throw 'PID nao corresponde ao launcher registrado; nenhum processo foi encerrado.'
    }
    # Stop only the verified launcher and its children, never arbitrary processes using a port.
    & taskkill.exe /PID $process.Id /T /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel encerrar a release anterior.' }
}
function Start-OwnedStack([string]$path,[string]$sha) {
    $runtime = Join-Path $path 'orchestrador-parking-fag/runtime/deploy'
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    $script = Join-Path $path $launcherRelative
    # This deployment is intended to outlive the Actions job. Do not pass runner tokens to it.
    $saved = @{}
    $names = @('RUNNER_TRACKING_ID','GH_TOKEN','GITHUB_TOKEN','ACTIONS_RUNTIME_TOKEN','ACTIONS_ID_TOKEN_REQUEST_TOKEN')
    foreach ($name in $names) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
        [Environment]::SetEnvironmentVariable($name,$null,'Process')
    }
    try {
        $process = Start-Process -FilePath (Get-Command powershell.exe).Source `
            -ArgumentList @('-NoProfile','-NonInteractive','-File',('"'+$script+'"'),'-Headless','-SkipBuild') `
            -WorkingDirectory (Join-Path $path 'orchestrador-parking-fag') -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $runtime 'launcher.log') -RedirectStandardError (Join-Path $runtime 'launcher-error.log')
    } finally {
        foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
    }
    return [pscustomobject]@{release=$path;commit=$sha;launcherId=$process.Id;started=$process.StartTime.ToUniversalTime().ToString('o')}
}
function Wait-Healthy($state) {
    for ($attempt=0; $attempt -lt 60; $attempt++) {
        if (-not (Get-Process -Id $state.launcherId -ErrorAction SilentlyContinue)) { throw 'Launcher encerrou; confira runtime/deploy e runtime/stack na release.' }
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:8080/actuator/health' -TimeoutSec 2
            $page = Invoke-WebRequest 'http://127.0.0.1:4173/totem' -UseBasicParsing -TimeoutSec 2
            $snapshot = Invoke-RestMethod 'http://127.0.0.1:4173/api/v1/parking-spots' -TimeoutSec 2
            $version = Invoke-RestMethod 'http://127.0.0.1:4173/deploy-info.json' -TimeoutSec 2
            if ($health.status -eq 'UP' -and $page.StatusCode -eq 200 -and $snapshot.monitoringActive -eq $true -and
                $version.commit -eq $state.commit) { return }
        } catch { }
        Start-Sleep -Seconds 2
    }
    throw 'Java, frontend e monitoramento nao ficaram saudaveis dentro do prazo.'
}

$active = $null
$oldStopped = $false
try {
    Stop-OwnedStack $previous
    $oldStopped = $true
    foreach ($port in @(8080,4173)) {
        if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
            throw "Porta $port pertence a outra execucao. Encerre a execucao manual antes de ativar o deploy."
        }
    }
    $active = Start-OwnedStack $release $CommitSha
    Wait-Healthy $active
    $active | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
    Write-Host "Deploy aprovado: $CommitSha"
    Write-Host 'Aplicacao: http://127.0.0.1:4173/totem e /mobile. O tunel existente pode continuar apontando para 4173.'
} catch {
    $originalError = $_
    if ($active) { Stop-OwnedStack $active }
    if ($previous -and $oldStopped) {
        Write-Warning 'Falha no deploy; tentando restaurar os processos da release anterior.'
        $rollback = Start-OwnedStack ([string]$previous.release) ([string]$previous.commit)
        Wait-Healthy $rollback
        $rollback | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
    }
    throw $originalError
}
