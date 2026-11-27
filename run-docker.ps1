# Script para rodar o Nexo Assist com volume persistente.
# O volume nexo-data guarda o SQLite entre reinicializacoes.

$ErrorActionPreference = "Stop"

$containerName = "nexo-assist"
$volumeName = "nexo-data"
$port = "3000"
$sessionSecret = "4ed24ab95e87ade8ed791d0c6657367aaa1146592137a3add69a994efaa40cba"

Write-Host "Parando container existente..." -ForegroundColor Cyan
$running = docker ps -q -f "name=$containerName" 2>$null
if ($running) {
    docker stop $containerName 2>$null | Out-Null
    docker rm $containerName 2>$null | Out-Null
    Write-Host "Container anterior removido." -ForegroundColor Green
}

Write-Host "Criando volume persistente $volumeName..." -ForegroundColor Cyan
$vol = docker volume ls -q -f "name=$volumeName" 2>$null
if (-not $vol) {
    docker volume create $volumeName | Out-Null
    Write-Host "Volume criado." -ForegroundColor Green
} else {
    Write-Host "Volume ja existe." -ForegroundColor Green
}

Write-Host "Iniciando novo container..." -ForegroundColor Cyan
docker run -d `
    --name $containerName `
    -p ${port}:3000 `
    -v ${volumeName}:/app/data `
    -e SESSION_SECRET=$sessionSecret `
    nexo-assist 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Container iniciado com sucesso!" -ForegroundColor Green
    Write-Host "Acesse: http://localhost:$port" -ForegroundColor White
    Write-Host "Volume: docker volume inspect $volumeName" -ForegroundColor DarkGray
} else {
    Write-Host "Falha ao iniciar o container." -ForegroundColor Red
    exit 1
}
