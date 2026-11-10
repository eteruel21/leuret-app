#!/usr/bin/env bash
set -e

# Leuret - Guardián de la rama main (hook pre-push).
# Git envía por stdin una línea por cada ref que se va a empujar:
#   <ref local> <sha local> <ref remoto> <sha remoto>
# Solo se bloquea cuando el destino es refs/heads/main, así que se pueden
# subir o borrar otras ramas aunque estés parado en main.

remote_name="$1"
blocked=0

while read -r local_ref local_sha remote_ref remote_sha; do
  [ -z "$remote_ref" ] && continue
  if [ "$remote_ref" = "refs/heads/main" ]; then
    blocked=1
  fi
done

if [ "$blocked" = "1" ]; then
  if [ "$ALLOW_DIRECT_PUSH_TO_MAIN" = "1" ] || [ "$ALLOW_DIRECT_PUSH_TO_MAIN" = "true" ]; then
    echo "⚠️  [Branch Protection] Push directo a 'main' autorizado explícitamente vía ALLOW_DIRECT_PUSH_TO_MAIN."
    exit 0
  fi

  echo ""
  echo "❌ [ERROR DE PROTECCIÓN DE RAMA MAIN]"
  echo "------------------------------------------------------------------"
  echo "El empuje (push) directo a la rama 'main' de ${remote_name:-origin} está protegido."
  echo "Para integrar cambios en 'main':"
  echo "  1. Cree una rama de función/fix: git checkout -b feat/mi-funcionalidad"
  echo "  2. Envíe sus cambios a GitHub: git push origin feat/mi-funcionalidad"
  echo "  3. Abra un Pull Request hacia 'main' para ejecutar las validaciones CI."
  echo "------------------------------------------------------------------"
  echo "Si requiere hacer bypass de emergencia en desarrollo local, ejecute:"
  echo "  ALLOW_DIRECT_PUSH_TO_MAIN=1 git push origin main"
  echo ""
  exit 1
fi

exit 0
