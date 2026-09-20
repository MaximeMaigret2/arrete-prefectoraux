#!/usr/bin/env bash
#
# Backfill manuel — Préfecture du Calvados (prefecture-14)
# Récupère tous les PDF du RAA départemental, du plus récent au plus ancien.
#
# Idempotent / résumable : chaque PDF déjà téléchargé (fichier présent et
# non vide) est sauté. Si le PC se met en veille en cours de route, il
# suffit de relancer le script : il reprendra là où il s'est arrêté sans
# retélécharger ce qui l'a déjà été.
#
# Respecte un espacement de 30s entre chaque téléchargement de PDF, comme
# le reste du projet.
#
# Usage : bash calvados-backfill.sh

set -uo pipefail

BASE="https://www.calvados.gouv.fr"
ROOT_URL="$BASE/Publications/Recueil-des-actes-administratifs"
OUT_DIR="calvados-raa"
LOG="$OUT_DIR/backfill.log"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
CURL_OPTS=(-sS -L --http1.1 --max-time 15 -A "$UA")
ESPACEMENT=30

mkdir -p "$OUT_DIR"
touch "$LOG"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"
}

resolve_url() {
  local href="$1"
  if [[ "$href" == http* ]]; then
    echo "$href"
  elif [[ "$href" == /* ]]; then
    echo "$BASE$href"
  else
    echo "$BASE/$href"
  fi
}

log "=== Debut backfill Calvados ==="

# --- Etape 1 : page racine -> lien "...-departemental" -------------------
log "Recuperation page racine..."
racine_html="$OUT_DIR/_racine.html"
http_code=$(curl "${CURL_OPTS[@]}" -o "$racine_html" -w "%{http_code}" "$ROOT_URL")
log "  HTTP $http_code"
if [[ "$http_code" != "200" ]]; then
  log "ERREUR: page racine inaccessible (HTTP $http_code). Arret."
  exit 1
fi

# Restreint au chemin sous ROOT_URL (ex: "/Publications/Recueil-des-actes-administratifs")
# pour eviter d'attraper un lien sans rapport ailleurs sur la page (ex: une
# page "...-departemental" du menu Services de l'Etat) qui se termine aussi
# par "-departemental".
root_path="${ROOT_URL#$BASE}"
dept_href=$(grep -oE "href=\"${root_path}/[^\"]*-departemental\"" "$racine_html" | head -1 | sed -E 's/href="([^"]*)"/\1/')
if [[ -z "$dept_href" ]]; then
  log "ERREUR: lien '-departemental' introuvable sous $root_path sur la page racine. Arret."
  exit 1
fi
dept_url=$(resolve_url "$dept_href")
log "Page departementale: $dept_url"

sleep 3

# --- Etape 2 : page departementale -> liste des annees disponibles -------
log "Recuperation page departementale..."
dept_html="$OUT_DIR/_departemental.html"
http_code=$(curl "${CURL_OPTS[@]}" -o "$dept_html" -w "%{http_code}" "$dept_url")
log "  HTTP $http_code"
if [[ "$http_code" != "200" ]]; then
  log "ERREUR: page departementale inaccessible (HTTP $http_code). Arret."
  exit 1
fi

# Annees : hrefs de la forme "<dept_href>/YYYY" (restreint au meme chemin
# que la page departementale elle-meme, pour eviter tout faux positif
# ailleurs sur la page). On extrait les 4 chiffres et on trie du plus
# recent au plus ancien.
years=$(grep -oE "href=\"${dept_href}/[0-9]{4}\"" "$dept_html" | sed -E 's#.*/([0-9]{4})"#\1#' | sort -rn -u)

if [[ -z "$years" ]]; then
  log "ERREUR: aucune annee trouvee sur la page departementale. Arret."
  exit 1
fi
log "Annees trouvees (plus recent -> plus ancien): $(echo "$years" | tr '\n' ' ')"

total_pdf=0
total_nouveaux=0
total_echecs=0

for annee in $years; do
  log "--- Annee $annee ---"

  annee_href=$(grep -oE "href=\"${dept_href}/${annee}\"" "$dept_html" | head -1 | sed -E 's/href="([^"]*)"/\1/')
  if [[ -z "$annee_href" ]]; then
    log "  ATTENTION: href pour $annee introuvable, on saute cette annee."
    continue
  fi
  annee_url=$(resolve_url "$annee_href")

  sleep 3

  annee_html="$OUT_DIR/_annee-$annee.html"
  log "  Recuperation page annee $annee..."
  http_code=$(curl "${CURL_OPTS[@]}" -o "$annee_html" -w "%{http_code}" "$annee_url")
  log "    HTTP $http_code"
  if [[ "$http_code" != "200" ]]; then
    log "  ATTENTION: page annee $annee inaccessible (HTTP $http_code), on saute cette annee."
    continue
  fi

  # La page liste les PDF en ordre chronologique CROISSANT -> on inverse
  # (tac) pour traiter du plus recent au plus ancien, comme demande.
  mapfile -t pdf_hrefs < <(grep -oE 'href="[^"]*\.pdf"' "$annee_html" | sed -E 's/href="([^"]*)"/\1/' | tac)

  log "  ${#pdf_hrefs[@]} PDF trouves pour $annee."

  mkdir -p "$OUT_DIR/$annee"

  for href in "${pdf_hrefs[@]}"; do
    pdf_url=$(resolve_url "$href")
    filename=$(basename "$pdf_url")
    dest="$OUT_DIR/$annee/$filename"

    total_pdf=$((total_pdf + 1))

    if [[ -s "$dest" ]]; then
      log "  [deja present, saute] $filename"
      continue
    fi

    log "  Telechargement: $filename"
    http_code=$(curl "${CURL_OPTS[@]}" -o "$dest" -w "%{http_code}" "$pdf_url")
    taille=$(stat -c%s "$dest" 2>/dev/null || stat -f%z "$dest" 2>/dev/null || echo "?")
    log "    -> HTTP $http_code - $taille octets"

    if [[ "$http_code" != "200" ]]; then
      log "    ECHEC, suppression du fichier partiel."
      rm -f "$dest"
      total_echecs=$((total_echecs + 1))
    else
      total_nouveaux=$((total_nouveaux + 1))
    fi

    log "  Pause ${ESPACEMENT}s..."
    sleep "$ESPACEMENT"
  done
done

log "=== Fin backfill Calvados ==="
log "PDF recenses: $total_pdf | nouveaux telecharges: $total_nouveaux | echecs: $total_echecs"
log "Fichiers dans: $OUT_DIR/<annee>/"
