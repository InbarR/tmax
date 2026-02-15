Get-Process electron -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "PID=$($_.Id) Title='$($_.MainWindowTitle)' Handle=$($_.MainWindowHandle)"
}
