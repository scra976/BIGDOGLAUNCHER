Add-Type -AssemblyName System.Drawing

$src = "C:\Users\Wesle\Desktop\Development\BIGDOGLAUNCHER\build\icon-src.jpg"
$png = "C:\Users\Wesle\Desktop\Development\BIGDOGLAUNCHER\build\icon.png"

$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap 512, 512
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::FromArgb(255, 10, 10, 12))
$g.DrawImage($img, 0, 0, 512, 512)
$bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$img.Dispose()
Write-Host "wrote $png"
