# https://github.com/key-moon/aclogin — paste REVEL_SESSION once, distribute
# it to oj/acc cookie stores (which atcoder-tui auto-imports on startup).
{
  lib,
  python3Packages,
  fetchPypi,
}:
python3Packages.buildPythonApplication rec {
  pname = "aclogin";
  version = "0.2.1";
  pyproject = true;
  src = fetchPypi {
    inherit pname version;
    hash = "sha256-zUbkSnwDmu1Pz//Zs/vzAYmNhFPzTL78PeXV9CJfdVQ=";
  };
  build-system = [ python3Packages.setuptools ];
  dependencies = [ python3Packages.appdirs ];
  doCheck = false;
  meta = {
    description = "Distribute an AtCoder REVEL_SESSION cookie to competitive-programming CLI tools";
    homepage = "https://github.com/key-moon/aclogin";
    license = lib.licenses.mit;
    mainProgram = "aclogin";
  };
}
