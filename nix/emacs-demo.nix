# `nix run .#emacs` — a throwaway terminal Emacs (user config untouched)
# preloaded with emacs/atcoder-tui.el, the eat backend, and the app itself;
# it opens the TUI on startup.
{
  emacs-nox,
  writeShellScriptBin,
  writeText,
  atcoder-tui,
}:
let
  emacs = emacs-nox.pkgs.withPackages (epkgs: [ epkgs.eat ]);
  init = writeText "atcoder-tui-demo-init.el" ''
    (setq inhibit-startup-screen t)
    (setq atcoder-tui-program "${atcoder-tui}/bin/atcoder-tui")
    ;; Use the sole startup window as-is: letting `pop-to-buffer' split it
    ;; would exec the TUI into a half-width window, and undoing the split
    ;; during init happens before redisplay's size baseline exists, so the
    ;; pty would keep the stale half-width size.
    (let ((display-buffer-overriding-action '(display-buffer-same-window)))
      (atcoder-tui))
  '';
in
writeShellScriptBin "atcoder-tui-emacs" ''
  exec ${emacs}/bin/emacs -q -l ${../emacs/atcoder-tui.el} -l ${init} "$@"
''
