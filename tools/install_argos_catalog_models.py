"""Instala os modelos Argos usados pelo pipeline editorial do catálogo.

Os diretórios são mantidos dentro de .artifact-work para não alterar a
instalação global do usuário. Execute a partir da raiz do projeto.
"""

from __future__ import annotations

import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARGOS_ROOT = ROOT / ".artifact-work" / "argos"


def configure_paths() -> None:
    paths = {
        "XDG_DATA_HOME": ARGOS_ROOT / "data",
        "XDG_CONFIG_HOME": ARGOS_ROOT / "config",
        "XDG_CACHE_HOME": ARGOS_ROOT / "cache",
        "ARGOS_PACKAGES_DIR": ARGOS_ROOT / "packages",
    }
    for name, path in paths.items():
        path.mkdir(parents=True, exist_ok=True)
        os.environ[name] = str(path)


def main() -> None:
    configure_paths()
    from argostranslate import package, translate

    package.update_package_index()
    available = package.get_available_packages()
    installed = {(lang.code, target.code) for lang in translate.get_installed_languages()
                 for target in lang.translations_to}
    for target in ("pt", "es"):
        if ("en", target) in installed:
            print(f"Modelo en->{target} já instalado")
            continue
        match = next(
            (item for item in available if item.from_code == "en" and item.to_code == target),
            None,
        )
        if match is None:
            raise RuntimeError(f"Modelo Argos en->{target} não encontrado no índice")
        print(f"Baixando modelo en->{target} {match.package_version}...")
        package.install_from_path(match.download())
        print(f"Modelo en->{target} instalado")


if __name__ == "__main__":
    main()
