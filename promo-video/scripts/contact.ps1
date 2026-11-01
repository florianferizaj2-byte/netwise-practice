# 用法: powershell -File scripts/contact.ps1 out/review/cyber out/review/cyber-sheet.jpg
param([string]$dir, [string]$out, [int]$cols = 3, [int]$tw = 640)
Add-Type -AssemblyName System.Drawing
$files = Get-ChildItem $dir -Filter f*.png | Sort-Object { [int]($_.BaseName.Substring(1)) }
$th = [int]($tw * 9 / 16)
$rows = [Math]::Ceiling($files.Count / $cols)
$sheet = New-Object System.Drawing.Bitmap ($tw * $cols), ($th * $rows)
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.InterpolationMode = 'HighQualityBicubic'
$font = New-Object System.Drawing.Font 'Consolas', 16, ([System.Drawing.FontStyle]::Bold)
for ($i = 0; $i -lt $files.Count; $i++) {
  $img = [System.Drawing.Image]::FromFile($files[$i].FullName)
  $x = ($i % $cols) * $tw; $y = [Math]::Floor($i / $cols) * $th
  $g.DrawImage($img, $x, $y, $tw, $th)
  $g.FillRectangle([System.Drawing.Brushes]::Black, $x, $y, 90, 26)
  $g.DrawString($files[$i].BaseName, $font, [System.Drawing.Brushes]::Yellow, $x + 4, $y + 2)
  $img.Dispose()
}
$sheet.Save($out, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose(); $sheet.Dispose()
