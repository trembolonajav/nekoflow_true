$ErrorActionPreference = "Stop"

$taskName = "NekoFlow-TiaManhwa-Adapter"
$projectRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $PSScriptRoot "tia_fetcher_windows.py"
$pythonw = (Get-Command pythonw.exe -ErrorAction Stop).Source
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$action = New-ScheduledTaskAction -Execute $pythonw -Argument ('"{0}"' -f $scriptPath) -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Adaptador autorizado do TiaManhwa para o NekoFlow" -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

$deadline = (Get-Date).AddSeconds(20)
do {
    Start-Sleep -Milliseconds 500
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:19091/health" -TimeoutSec 2
        if ($health.status -eq "UP") {
            Write-Output "NekoFlow TiaManhwa adapter installed and running."
            exit 0
        }
    } catch {
        # Continue until the startup deadline.
    }
} while ((Get-Date) -lt $deadline)

throw "The scheduled adapter was registered but did not become healthy. Check runtime/tia-fetcher.log."
