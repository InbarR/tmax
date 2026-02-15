Add-Type -AssemblyName System.Windows.Forms
$img = [System.Windows.Forms.Clipboard]::GetImage()
if ($img) {
    $path = "C:\tmp\codeterm\assets\screenshot.png"
    $img.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Saved to $path"
    $img.Dispose()
} else {
    Write-Host "No image in clipboard"
}
