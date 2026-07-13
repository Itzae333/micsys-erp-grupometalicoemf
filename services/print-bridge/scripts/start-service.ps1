# start-service.ps1
# Arranca (o reinicia) la tarea programada del Print Bridge y confirma que
# el servicio responde en localhost:7788. Correr en la PC del cliente,
# loggeado con el mismo usuario que usa la ticketera. No requiere Admin
# salvo que la tarea no exista todavía (en ese caso corre el instalador).
#
# Uso: powershell -ExecutionPolicy Bypass -File start-service.ps1

$taskName = 'GrupoMetalicoEMF-PrintBridge'

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) {
    Write-Host "❌ La tarea '$taskName' no existe. Corre PrintBridge-Setup.exe como Administrador primero." -ForegroundColor Red
    exit 1
}

Write-Host "Usuario actual : $env:USERDOMAIN\$env:USERNAME"
Write-Host "Usuario tarea  : $($task.Principal.UserId)"
if ("$env:USERDOMAIN\$env:USERNAME" -ne $task.Principal.UserId -and $env:USERNAME -ne $task.Principal.UserId) {
    Write-Host "⚠️  Estás loggeado con un usuario distinto al configurado en la tarea." -ForegroundColor Yellow
    Write-Host "    Si la impresora no está compartida entre usuarios, esto puede no imprimir." -ForegroundColor Yellow
}

Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Get-Process -Name "PrintBridge" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
Start-ScheduledTask -TaskName $taskName

$up = $false
for ($i = 0; $i -lt 8; $i++) {
    Start-Sleep -Milliseconds 500
    try { Invoke-WebRequest http://localhost:7788 -UseBasicParsing -TimeoutSec 2 | Out-Null; $up = $true; break }
    catch { if ($_.Exception.Response) { $up = $true; break } }
}

if ($up) {
    Write-Host "✅ PrintBridge está corriendo en http://localhost:7788" -ForegroundColor Green
} else {
    Write-Host "❌ El servicio no respondió. Cierra sesión de Windows y vuelve a entrar, o revisa que el usuario de la tarea coincida con la sesión activa." -ForegroundColor Red
}
