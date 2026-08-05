export const PS_INTEGRATION_CONTENT =
  '$Global:__tmax_origPrompt = $function:prompt\n' +
  'function Global:prompt {\n' +
  '  $p = & $Global:__tmax_origPrompt\n' +
  '  $d = $executionContext.SessionState.Path.CurrentLocation.Path\n' +
  '  $u = "file:///" + ($d -replace "\\\\","/")\n' +
  '  $esc = [char]27\n' +
  '  $bel = [char]7\n' +
  '  [Console]::Write("${esc}]7;${u}${bel}")\n' +
  '  return $p\n' +
  '}\n';
