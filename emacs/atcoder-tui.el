;;; atcoder-tui.el --- Run the atcoder-tui AtCoder viewer inside Emacs -*- lexical-binding: t; -*-

;; Author: toyboot4e <toyboot4e@gmail.com>
;; Version: 0.1.0
;; Package-Requires: ((emacs "27.1"))
;; Keywords: terminals, tools
;; URL: https://github.com/toyboot4e/atcoder-tui

;; This file is not part of GNU Emacs.

;;; Commentary:

;; A thin Emacs wrapper around atcoder-tui, the read-only AtCoder viewer
;; for the terminal.
;;
;; `M-x atcoder-tui' opens (or re-focuses) the TUI in a terminal
;; emulator buffer.  The backend is picked automatically: `eat' if
;; installed, then `vterm', then the built-in `term'.  All keys go to
;; the TUI; quit it with `q' as usual.
;;
;; The login-session subcommands are also exposed as Emacs commands so
;; the cookie can be managed without leaving Emacs:
;;
;;   `atcoder-tui-session-status'  show whether a session is configured
;;   `atcoder-tui-session-import'  copy REVEL_SESSION from oj / acc
;;   `atcoder-tui-session-set'     paste a cookie value (read hidden)
;;   `atcoder-tui-session-check'   verify the session against atcoder.jp
;;
;; The program is located in this order: `atcoder-tui-program' if set,
;; an `atcoder-tui' executable on `exec-path', the repo's compiled
;; `dist/atcoder-tui' next to this file, and finally `bun run
;; src/index.tsx' in the repo checkout.

;;; Code:

(defgroup atcoder-tui nil
  "Run the atcoder-tui AtCoder viewer inside Emacs."
  :group 'external
  :prefix "atcoder-tui-")

(defcustom atcoder-tui-program nil
  "Program used to launch atcoder-tui, or nil to auto-detect.
Either a program name (string) or a full command line (list of
strings).  When nil, look for `atcoder-tui' on variable `exec-path', then
for the repo's `dist/atcoder-tui' binary, then fall back to
running the sources with bun."
  :type '(choice (const :tag "Auto-detect" nil)
                 (string :tag "Program")
                 (repeat :tag "Command line" string)))

(defcustom atcoder-tui-backend 'auto
  "Terminal emulator used for the TUI buffer.
`auto' prefers `eat', then `vterm', then the built-in `term'."
  :type '(choice (const :tag "Auto (eat > vterm > term)" auto)
                 (const eat)
                 (const vterm)
                 (const term)))

(defcustom atcoder-tui-buffer-name "*atcoder-tui*"
  "Name of the buffer running the TUI."
  :type 'string)

(defconst atcoder-tui--source-root
  (let ((file (or load-file-name buffer-file-name)))
    (and file (expand-file-name ".." (file-name-directory file))))
  "Root of the atcoder-tui repo checkout, when run from one.")

(defvar atcoder-tui--session-buffer-name "*atcoder-tui session*"
  "Name of the buffer showing `session' subcommand output.")

;;;; Locating the program

(defun atcoder-tui--command ()
  "Return a cons (DIRECTORY . COMMAND-LIST) for launching atcoder-tui.
Signal a `user-error' when no way to run the program is found."
  (let ((root atcoder-tui--source-root))
    (cond
     ((stringp atcoder-tui-program)
      (cons default-directory (list atcoder-tui-program)))
     ((consp atcoder-tui-program)
      (cons default-directory (copy-sequence atcoder-tui-program)))
     ((executable-find "atcoder-tui")
      (cons default-directory (list "atcoder-tui")))
     ((and root (file-executable-p (expand-file-name "dist/atcoder-tui" root)))
      (cons root (list (expand-file-name "dist/atcoder-tui" root))))
     ((and root
           (file-exists-p (expand-file-name "src/index.tsx" root))
           (executable-find "bun"))
      (cons root (list "bun" "run" "src/index.tsx")))
     (t
      (user-error
       "Cannot find atcoder-tui; install it, build dist/atcoder-tui, or set `atcoder-tui-program'")))))

;;;; Terminal backends

(declare-function eat-mode "eat")
(declare-function eat-exec "eat" (buffer name command startfile switches))
(declare-function vterm-mode "vterm")
(declare-function term-ansi-make-term "term"
                  (name program &optional startfile &rest switches))
(declare-function term-char-mode "term")
(defvar vterm-shell)
(defvar vterm-kill-buffer-on-exit)

(defun atcoder-tui--backend ()
  "Return the terminal backend to use, as a symbol."
  (if (eq atcoder-tui-backend 'auto)
      (cond ((require 'eat nil t) 'eat)
            ((require 'vterm nil t) 'vterm)
            (t 'term))
    atcoder-tui-backend))

(defun atcoder-tui--start-eat (command)
  "Start COMMAND in the current (displayed) buffer with `eat'."
  (require 'eat)
  (eat-mode)
  (eat-exec (current-buffer) "atcoder-tui" (car command) nil (cdr command)))

(defun atcoder-tui--start-vterm (command)
  "Start COMMAND in the current (displayed) buffer with `vterm'."
  (require 'vterm)
  (let ((vterm-shell (mapconcat #'shell-quote-argument command " "))
        (vterm-kill-buffer-on-exit nil))
    (vterm-mode)))

(defun atcoder-tui--start-term (command)
  "Start COMMAND in the current (displayed) buffer with `term'."
  (require 'term)
  (apply #'term-ansi-make-term (buffer-name) (car command) nil (cdr command))
  (term-char-mode))

;;;; The TUI

(defun atcoder-tui--sync-size (buffer)
  "Resize BUFFER's terminal to match the window now showing it.
The window displaying BUFFER can change size between process start
and the first redisplay (e.g. a split being undone during startup)
without the usual window-size-change machinery firing; re-run it so
the pty and the TUI catch up."
  (when (and (buffer-live-p buffer)
             (process-live-p (get-buffer-process buffer))
             (get-buffer-window buffer t))
    (window--adjust-process-windows)))

;;;###autoload
(defun atcoder-tui ()
  "Open the atcoder-tui viewer, reusing a running instance if present.
The TUI runs in a terminal emulator buffer (see `atcoder-tui-backend');
quit it with `q' as in a plain terminal."
  (interactive)
  (let ((existing (get-buffer atcoder-tui-buffer-name)))
    (if (and existing (process-live-p (get-buffer-process existing)))
        (pop-to-buffer existing)
      (when existing (kill-buffer existing))
      (pcase-let* ((`(,directory . ,command) (atcoder-tui--command))
                   (backend (atcoder-tui--backend))
                   (buffer (get-buffer-create atcoder-tui-buffer-name)))
        ;; Display the buffer BEFORE starting the process: the terminal
        ;; backends size the pty from the window at exec time, so an
        ;; undisplayed buffer would start the TUI at the default 80x24.
        (pop-to-buffer buffer)
        (with-current-buffer buffer
          (setq default-directory directory)
          (pcase backend
            ('eat (atcoder-tui--start-eat command))
            ('vterm (atcoder-tui--start-vterm command))
            ('term (atcoder-tui--start-term command))
            (other (user-error "Unknown backend: %s" other))))
        ;; The window may be resized again before the first redisplay
        ;; (demo init, display-buffer hooks); sync the pty afterwards.
        (run-with-timer 0.3 nil #'atcoder-tui--sync-size buffer)))))

;;;; Session subcommands

(defun atcoder-tui--session-filter (process output)
  "Insert OUTPUT from the session PROCESS at its buffer's process mark."
  (let ((buffer (process-buffer process)))
    (when (buffer-live-p buffer)
      (with-current-buffer buffer
        (let ((inhibit-read-only t)
              (at-end (= (point) (process-mark process))))
          (save-excursion
            (goto-char (process-mark process))
            (insert output)
            (set-marker (process-mark process) (point)))
          (when at-end (goto-char (process-mark process))))))))

(defun atcoder-tui--session-sentinel (process event)
  "Report the exit of the session PROCESS described by EVENT."
  (when (memq (process-status process) '(exit signal))
    (let ((buffer (process-buffer process)))
      (when (buffer-live-p buffer)
        (with-current-buffer buffer
          (let ((inhibit-read-only t))
            (goto-char (point-max))
            (insert (format "\n[%s]\n" (string-trim event))))))
      (if (and (eq (process-status process) 'exit)
               (zerop (process-exit-status process)))
          (message "atcoder-tui: %s" (string-trim event))
        (message "atcoder-tui session command failed; see %s"
                 atcoder-tui--session-buffer-name)))))

(defun atcoder-tui--run-session (subcommand &optional input)
  "Run `atcoder-tui session SUBCOMMAND' asynchronously.
Output goes to `atcoder-tui--session-buffer-name'.  When INPUT is
non-nil, send it (plus a newline) to the process's stdin — used to
feed the cookie value to `session set' without putting it in argv."
  (pcase-let* ((`(,directory . ,command) (atcoder-tui--command))
               (full-command (append command (list "session" subcommand))))
    (let ((buffer (get-buffer-create atcoder-tui--session-buffer-name)))
      (with-current-buffer buffer
        (let ((inhibit-read-only t))
          (special-mode)
          (erase-buffer)
          (insert (format "$ %s session %s\n\n"
                          (mapconcat #'identity command " ") subcommand))))
      (let* ((default-directory directory)
             (process (make-process
                       :name (concat "atcoder-tui-session-" subcommand)
                       :buffer buffer
                       :command full-command
                       :noquery t
                       :filter #'atcoder-tui--session-filter
                       :sentinel #'atcoder-tui--session-sentinel)))
        (set-marker (process-mark process)
                    (with-current-buffer buffer (point-max)))
        (when input
          (process-send-string process (concat input "\n"))))
      (display-buffer buffer))))

;;;###autoload
(defun atcoder-tui-session-status ()
  "Show whether an AtCoder login session is configured."
  (interactive)
  (atcoder-tui--run-session "status"))

;;;###autoload
(defun atcoder-tui-session-import ()
  "Import the REVEL_SESSION cookie from an oj or acc store."
  (interactive)
  (atcoder-tui--run-session "import"))

;;;###autoload
(defun atcoder-tui-session-check ()
  "Verify the configured session against atcoder.jp."
  (interactive)
  (atcoder-tui--run-session "check"))

;;;###autoload
(defun atcoder-tui-session-set ()
  "Read a REVEL_SESSION cookie value and save it after verification.
The value is read without echo and piped to the CLI's stdin, so it
never appears in the command line or in the output buffer."
  (interactive)
  (let ((value (read-passwd "REVEL_SESSION value: ")))
    (if (string-empty-p value)
        (user-error "Empty value; aborted")
      (atcoder-tui--run-session "set" value))))

(provide 'atcoder-tui)
;;; atcoder-tui.el ends here
