[CmdletBinding()]
param(
    [string]$DeployRoot = (Join-Path $env:LOCALAPPDATA 'ParkingFagDeploy'),
    [string]$RunnerRoot = 'C:\actions-runner'
)
$ErrorActionPreference = 'Stop'
$DeployRoot = [IO.Path]::GetFullPath($DeployRoot)
$shared = Join-Path $DeployRoot 'shared'
New-Item -ItemType Directory -Force -Path $shared | Out-Null
$configFile = Join-Path $shared 'backend.env'
if (-not (Test-Path -LiteralPath $configFile)) {
    @'
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=parking_fag
DB_USER=root
DB_PASSWORD=CHANGE_ME
'@ | Set-Content -LiteralPath $configFile -Encoding UTF8
    Write-Host 'Modelo de configuracao criado; informe a senha local do MySQL antes do deploy.'
} else { Write-Host 'Configuracao existente preservada.' }
Write-Host "Configuracao local, fora do Git: $configFile"
Write-Host "Destino persistente: $DeployRoot"
Write-Host 'Se o runner usar outra conta, configure PARKING_DEPLOY_ROOT no GitHub com esse destino.'
$config = @{}
foreach ($line in Get-Content -LiteralPath $configFile) {
    if ($line -match '^\s*([A-Z_][A-Z0-9_]*)=(.*)$') { $config[$matches[1]]=$matches[2].Trim().Trim('"').Trim("'") }
}
$missing = @('DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD') | Where-Object {
    [string]::IsNullOrWhiteSpace($config[$_]) -or $config[$_] -eq 'CHANGE_ME'
}
if (@($missing).Count -gt 0) { Write-Warning ('Configure os campos: ' + ($missing -join ', ')) }
$client = New-Object Net.Sockets.TcpClient
try {
    $port = 0
    if (-not [int]::TryParse([string]$config['DB_PORT'],[ref]$port) -or $port -lt 1 -or $port -gt 65535) { throw 'DB_PORT invalida.' }
    $connection = $client.ConnectAsync([string]$config['DB_HOST'],$port)
    if (-not $connection.Wait(2000) -or -not $client.Connected) { throw 'Porta de banco indisponivel.' }
    Write-Host 'Porta do banco acessivel. Usuario, senha e migrations serao verificados pela aplicacao no deploy.'
} catch { Write-Warning 'Banco inacessivel: confirme MySQL ativo, DB_HOST e DB_PORT.' }
finally { $client.Dispose() }
if (Test-Path -LiteralPath (Join-Path $RunnerRoot '.runner')) {
    Write-Host 'Registro local do runner encontrado. Confira status Online e rotulo parking-fag no GitHub.'
} else { Write-Warning "Runner ainda nao encontrado em $RunnerRoot. Cadastre-o pelo Settings do repositorio." }
if (Get-Command cloudflared -ErrorAction SilentlyContinue) {
    Write-Host 'cloudflared encontrado. Para acesso externo: cloudflared tunnel --url http://127.0.0.1:4173'
} else { Write-Warning 'Instale cloudflared pelo guia oficial antes de acessar por outra rede.' }
Write-Host 'Este script nao instala programas, nao imprime senhas, nao cadastra o runner e nao inicia o sistema.'
