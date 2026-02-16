Add-Type -AssemblyName System.Drawing

$srcPath = "C:\projects\tmax\tmax.png"
$icoPath = "C:\projects\tmax\assets\icon.ico"

$img = [System.Drawing.Image]::FromFile($srcPath)

# Create multiple sizes for ICO
$sizes = @(16, 32, 48, 64, 128, 256)
$icons = @()

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($img, $size, $size)
    $icons += $bmp
}

# Write ICO file
$ms = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($ms)

# ICO header
$writer.Write([UInt16]0)      # Reserved
$writer.Write([UInt16]1)      # Type: ICO
$writer.Write([UInt16]$icons.Count) # Number of images

# Calculate data offset (header=6 + entries=16*count)
$dataOffset = 6 + (16 * $icons.Count)
$imageData = @()

foreach ($bmp in $icons) {
    $pngStream = New-Object System.IO.MemoryStream
    $bmp.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngBytes = $pngStream.ToArray()
    $pngStream.Dispose()

    $w = if ($bmp.Width -ge 256) { 0 } else { $bmp.Width }
    $h = if ($bmp.Height -ge 256) { 0 } else { $bmp.Height }

    # Directory entry
    $writer.Write([byte]$w)          # Width
    $writer.Write([byte]$h)          # Height
    $writer.Write([byte]0)           # Color palette
    $writer.Write([byte]0)           # Reserved
    $writer.Write([UInt16]1)         # Color planes
    $writer.Write([UInt16]32)        # Bits per pixel
    $writer.Write([UInt32]$pngBytes.Length)  # Size
    $writer.Write([UInt32]$dataOffset)       # Offset

    $dataOffset += $pngBytes.Length
    $imageData += ,($pngBytes)
}

foreach ($data in $imageData) {
    $writer.Write($data)
}

$writer.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $ms.ToArray())

$writer.Dispose()
$ms.Dispose()
$img.Dispose()
foreach ($bmp in $icons) { $bmp.Dispose() }

Write-Host "Created ICO at $icoPath with $($icons.Count) sizes"
