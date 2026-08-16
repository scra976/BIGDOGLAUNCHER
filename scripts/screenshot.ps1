Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$src = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $src.Width, $src.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($src.Location, [System.Drawing.Point]::Empty, $src.Size)
$out = "C:\Users\Wesle\Desktop\Development\BIGDOGLAUNCHER\build\dev-screenshot.png"
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Host $out
