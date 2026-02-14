Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinHelper {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
}
public struct RECT {
    public int Left; public int Top; public int Right; public int Bottom;
}
"@

$procs = Get-Process electron -ErrorAction SilentlyContinue
Write-Host "Found $($procs.Count) electron processes"

foreach ($p in $procs) {
    Write-Host "PID: $($p.Id) Title: '$($p.MainWindowTitle)' Handle: $($p.MainWindowHandle)"
    if ($p.MainWindowHandle -ne 0) {
        $rect = New-Object RECT
        [WinHelper]::GetWindowRect($p.MainWindowHandle, [ref]$rect)
        Write-Host "  Window rect: Left=$($rect.Left) Top=$($rect.Top) Right=$($rect.Right) Bottom=$($rect.Bottom)"

        # Move to visible area and show
        [WinHelper]::MoveWindow($p.MainWindowHandle, 100, 100, 1200, 800, $true)
        [WinHelper]::ShowWindow($p.MainWindowHandle, 9)  # SW_RESTORE
        [WinHelper]::SetForegroundWindow($p.MainWindowHandle)
        Write-Host "  Window moved to (100,100) and brought to front"
    }
}
