Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Find the TermMight window
$procs = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' }

if ($procs.Count -eq 0) {
    Write-Host "No TermMight window found"
    exit 1
}

$proc = $procs[0]
Write-Host "Found window: $($proc.MainWindowTitle) (PID $($proc.Id))"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left, Top, Right, Bottom; }
public class WinAPI {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

[WinAPI]::SetForegroundWindow($proc.MainWindowHandle)
Start-Sleep -Seconds 1

$rect = New-Object RECT
[WinAPI]::GetWindowRect($proc.MainWindowHandle, [ref]$rect)

$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top

Write-Host "Window bounds: $($rect.Left),$($rect.Top) ${width}x${height}"

$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size($width, $height)))

$outPath = "C:\tmp\codeterm\screenshot.png"
$bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "Screenshot saved to $outPath"
