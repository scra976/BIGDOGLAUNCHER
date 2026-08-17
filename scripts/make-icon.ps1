Add-Type -AssemblyName System.Drawing

$src = "C:\Users\Wesle\Desktop\Development\BIGDOGLAUNCHER\build\icon.jpg"
$png = "C:\Users\Wesle\Desktop\Development\BIGDOGLAUNCHER\build\icon.png"
$logo = "C:\Users\Wesle\Desktop\Development\BIGDOGLAUNCHER\public\logo.jpg"
$res = "C:\Users\Wesle\Desktop\Development\BIGDOGLAUNCHER\resources\logo.jpg"

$img = [System.Drawing.Image]::FromFile($src)
$bmp = New-Object System.Drawing.Bitmap 512, 512
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::FromArgb(255, 8, 8, 12))
$g.DrawImage($img, 0, 0, 512, 512)
$bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$img.Dispose()

Copy-Item $src $logo -Force
Copy-Item $src $res -Force
Write-Host "wrote $png"
