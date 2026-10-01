$mysqldPath = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe"
$iniPath = "$env:USERPROFILE\.forge_gym_mysql\my.ini"

if (-not (Test-Path $mysqldPath)) {
    Write-Error "mysqld.exe not found at $mysqldPath"
    exit 1
}

# Test if port 3306 is already active
$tcp = Test-NetConnection -ComputerName 127.0.0.1 -Port 3306 -InformationLevel Quiet
if ($tcp) {
    Write-Host "MySQL is already running on port 3306." -ForegroundColor Green
    exit 0
}

Write-Host "Starting MySQL server with config $iniPath..." -ForegroundColor Cyan
& $mysqldPath --defaults-file=$iniPath --console
