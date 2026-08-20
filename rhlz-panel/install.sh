#!/usr/bin/env bash
# RHLZ Panel installer — production one-click + short interactive menu.
# Zero prompts when stdin is not a TTY, or --yes / RHLZ_NONINTERACTIVE=1.

set -euo pipefail

PANEL_TITLE="RHLZ PANEL"
PANEL_SUBTITLE="RHLZ Panel"
PANEL_AUTHOR="RHLZ"
PANEL_VERSION="3.1.0"
DEFAULT_PROD_PORT=6767
DEFAULT_DEV_PORT=30000
REPO_URL="https://github.com/NggKhaiz/RHLZ-PANEL.git"
PM2_NAME="rhlz-panel"

C_RESET='\033[0m'
C_BOLD='\033[1m'
C_DEEP_BLUE='\033[38;5;33m'
C_VIBRANT_CYAN='\033[38;5;45m'
C_ELECTRIC_PURPLE='\033[38;5;141m'
C_EMERALD='\033[38;5;48m'
C_AMBER='\033[38;5;214m'
C_ROSE='\033[38;5;204m'
C_CRIMSON='\033[38;5;196m'
C_WHITE='\033[38;5;255m'
C_MUTED='\033[38;5;244m'
BG_GREEN='\033[48;5;28;38;5;255m'
BG_AMBER='\033[48;5;208;38;5;232m'

NONINTERACTIVE=0
DEV_MODE=0
SELECTED_RUNTIME="${RHLZ_RUNTIME:-docker}"
SELECTED_THEME="${RHLZ_THEME:-red}"
TARGET_PORT="${RHLZ_PORT:-}"
ADMIN_USER="${RHLZ_ADMIN_USER:-}"
ADMIN_PASS="${RHLZ_ADMIN_PASS:-}"
NO_JAVA=0
NO_DOCKER=0
SKIP_BUILD=0
BIND_ADDR="0.0.0.0"
RUNTIME_LOCKED="true"
PROJECT_DIR=""
SHOW_HELP=0

print_banner() {
    echo -e "${C_VIBRANT_CYAN}${C_BOLD}"
    echo "██████╗  █████╗ ██╗   ██╗███████╗███╗   ██╗    ██╗  ██╗██╗   ██╗██████╗"
    echo "██╔══██╗██╔══██╗██║   ██║██╔════╝████╗  ██║    ██║  ██║██║   ██║██╔══██╗"
    echo "██████╔╝███████║██║   ██║█████╗  ██╔██╗ ██║    ███████║██║   ██║██████╔╝"
    echo "██╔══██╗██╔══██║╚██╗ ██╔╝██╔══╝  ██║╚██╗██║    ██╔══██║██║   ██║██╔══██╗"
    echo "██║  ██║██║  ██║ ╚████╔╝ ███████╗██║ ╚████║    ██║  ██║╚██████╔╝██████╔╝"
    echo "╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝╚═╝  ╚═══╝    ╚═╝  ╚═╝ ╚════╝ ╚════╝"
    echo -e "${C_RESET}"
    echo -e "  ${C_WHITE}${C_BOLD}${PANEL_SUBTITLE} (v${PANEL_VERSION})${C_RESET}  ${C_MUTED}${PANEL_AUTHOR}${C_RESET}"
    echo ""
}

log_info()    { echo -e " ${C_DEEP_BLUE}[INFO]${C_RESET} ${C_WHITE}$1${C_RESET}"; }
log_success() { echo -e " ${C_EMERALD}${C_BOLD}[✓ SUCCESS]${C_RESET} ${C_WHITE}$1${C_RESET}"; }
log_warning() { echo -e " ${C_AMBER}${C_BOLD}[! WARNING]${C_RESET} ${C_AMBER}$1${C_RESET}"; }
log_error()   { echo -e " ${C_CRIMSON}${C_BOLD}[✗ ERROR]${C_RESET} ${C_CRIMSON}$1${C_RESET}"; }

usage() {
    cat <<EOF
RHLZ Panel installer v${PANEL_VERSION}

Usage: bash install.sh [flags]

  --yes | -y                     non-interactive production install
  --dev                          development setup (port ${DEFAULT_DEV_PORT})
  --runtime docker|local         default docker
  --theme red|blue|purple|cyan|green|amber|rose|white
  --port N                       default ${DEFAULT_PROD_PORT} (prod) / ${DEFAULT_DEV_PORT} (dev)
  --admin USER:PASS              create/reset owner
  --admin-user U --admin-pass P  same, split form
  --no-java                      skip host OpenJDK
  --no-docker                    do not install Docker
  --skip-build                   reuse existing dist/
  --bind 0.0.0.0                 listen address (documented default)
  --help                         this message

Env: RHLZ_NONINTERACTIVE=1 RHLZ_RUNTIME RHLZ_THEME RHLZ_PORT
     RHLZ_ADMIN_USER RHLZ_ADMIN_PASS RHLZ_SESSION_SECRET
EOF
}

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --yes|-y) NONINTERACTIVE=1 ;;
            --dev) DEV_MODE=1 ;;
            --runtime) SELECTED_RUNTIME="${2:-docker}"; shift ;;
            --theme) SELECTED_THEME="${2:-red}"; shift ;;
            --port) TARGET_PORT="${2:-}"; shift ;;
            --admin)
                local ap="${2:-}"
                ADMIN_USER="${ap%%:*}"
                ADMIN_PASS="${ap#*:}"
                shift
                ;;
            --admin-user) ADMIN_USER="${2:-}"; shift ;;
            --admin-pass) ADMIN_PASS="${2:-}"; shift ;;
            --no-java) NO_JAVA=1 ;;
            --no-docker) NO_DOCKER=1 ;;
            --skip-build) SKIP_BUILD=1 ;;
            --bind) BIND_ADDR="${2:-0.0.0.0}"; shift ;;
            --help|-h) SHOW_HELP=1 ;;
            *) log_warning "Unknown flag: $1" ;;
        esac
        shift
    done
}

is_tty() {
    [ -t 0 ] && return 0
    return 1
}

check_root() {
    if [ "${EUID:-$(id -u)}" -ne 0 ]; then
        log_warning "Running as non-root. Package installs may require sudo."
    fi
}

get_public_ip() {
    local ip
    ip=$(curl -s --max-time 4 https://api.ipify.org 2>/dev/null || curl -s --max-time 4 https://ifconfig.me 2>/dev/null || echo "127.0.0.1")
    echo "$ip" | tr -d '\n' | tr -d '\r'
}

setup_system_dependencies() {
    log_info "Updating system package tools..."
    if command -v apt-get &>/dev/null; then
        sudo dpkg --configure -a 2>/dev/null || true
        local needed=()
        command -v curl &>/dev/null || needed+=("curl")
        command -v git &>/dev/null || needed+=("git")
        command -v tar &>/dev/null || needed+=("tar")
        command -v xz &>/dev/null || needed+=("xz-utils")
        command -v jq &>/dev/null || needed+=("jq")
        [ -f /etc/ssl/certs/ca-certificates.crt ] || needed+=("ca-certificates")
        command -v make &>/dev/null || needed+=("build-essential")
        if [ ${#needed[@]} -gt 0 ]; then
            sudo DEBIAN_FRONTEND=noninteractive apt-get update -y -qq 2>/dev/null || true
            sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
                -o Dpkg::Options::="--force-confdef" \
                -o Dpkg::Options::="--force-confold" \
                "${needed[@]}" 2>/dev/null || true
        fi
    elif command -v yum &>/dev/null; then
        sudo yum install -y -q curl git make gcc-c++ ca-certificates tar xz jq || true
    fi
    log_success "Base system dependencies configured."
}

ensure_nodejs() {
    log_info "Verifying Node.js 20+..."
    local need_install=0
    if ! command -v node &>/dev/null; then
        need_install=1
    else
        local node_ver
        node_ver=$(node -v | cut -d'.' -f1 | tr -d 'v')
        if [ "$node_ver" -lt 20 ]; then need_install=1; fi
    fi
    if [ "$need_install" -eq 1 ]; then
        if command -v apt-get &>/dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v yum &>/dev/null; then
            curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
            sudo yum install -y nodejs
        fi
    fi
    log_success "Node.js $(node -v) verified."
}

prompt_runtime_configuration() {
    if [ "$NONINTERACTIVE" -eq 1 ]; then
        RUNTIME_LOCKED="true"
        log_success "Active Server Runtime: ${SELECTED_RUNTIME} (locked)"
        return
    fi
    echo ""
    echo -e "  ${C_DEEP_BLUE}[ 1 ] Docker ${C_EMERALD}(recommended)${C_RESET}"
    echo -e "  ${C_AMBER}[ 2 ] Local process engine${C_RESET}"
    local choice
    read -r -p "  Enter Selection [1 or 2, default: 1]: " choice || true
    case "$(echo "${choice:-}" | tr -d ' ')" in
        2) SELECTED_RUNTIME="local" ;;
        *) SELECTED_RUNTIME="docker" ;;
    esac
    RUNTIME_LOCKED="true"
    log_success "Active Server Runtime: ${SELECTED_RUNTIME}"
}

prompt_theme_selection() {
    if [ "$NONINTERACTIVE" -eq 1 ]; then
        log_success "Panel Accent Theme: ${SELECTED_THEME}"
        return
    fi
    echo ""
    echo -e "  1 red  2 blue  3 purple  4 cyan  5 green  6 amber  7 rose  8 white"
    local theme_choice
    read -r -p "  Theme [1-8, default: 1]: " theme_choice || true
    case "$(echo "${theme_choice:-}" | tr -d ' ')" in
        2) SELECTED_THEME="blue" ;;
        3) SELECTED_THEME="purple" ;;
        4) SELECTED_THEME="cyan" ;;
        5) SELECTED_THEME="green" ;;
        6) SELECTED_THEME="amber" ;;
        7) SELECTED_THEME="rose" ;;
        8) SELECTED_THEME="white" ;;
        *) SELECTED_THEME="red" ;;
    esac
    log_success "Panel Accent Theme: ${SELECTED_THEME}"
}

install_java_host() {
    if [ "$NO_JAVA" -eq 1 ]; then
        log_info "Skipping host Java (--no-java)."
        return
    fi
    if command -v java &>/dev/null; then
        log_success "Java is already installed."
        return
    fi
    if [ -f ".data/bin/jre-25/bin/java" ] || [ -f ".data/bin/jre-21/bin/java" ]; then
        log_success "Portable OpenJDK detected."
        return
    fi
    if [ "$NONINTERACTIVE" -eq 0 ]; then
        local install_java
        read -r -p "  Install OpenJDK on host? [Y/n]: " install_java || true
        if [[ "${install_java:-}" =~ ^[Nn]$ ]]; then
            log_info "Skipping host Java."
            return
        fi
    fi
    log_info "Installing OpenJDK..."
    if command -v apt-get &>/dev/null; then
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends openjdk-21-jre-headless 2>/dev/null \
            || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends openjdk-17-jre-headless 2>/dev/null \
            || log_warning "System Java unavailable; panel will provision a portable JRE."
    fi
}

start_docker_engine() {
    if command -v docker &>/dev/null && docker info &>/dev/null; then
        return 0
    fi
    sudo service docker start 2>/dev/null || true
    if ! docker info &>/dev/null; then
        if command -v dockerd &>/dev/null; then
            sudo dockerd >/tmp/rhlz-dockerd.log 2>&1 &
            sleep 2
        fi
    fi
}

install_docker_engine() {
    if command -v docker &>/dev/null; then
        log_success "Docker Engine is present."
        start_docker_engine
        sudo usermod -aG docker "${SUDO_USER:-$USER}" 2>/dev/null || true
        return
    fi
    if [ "$NO_DOCKER" -eq 1 ]; then
        if [ "$SELECTED_RUNTIME" = "docker" ]; then
            log_error "Docker is required for --runtime docker but --no-docker was set."
            exit 1
        fi
        return
    fi
    if [ "$SELECTED_RUNTIME" != "docker" ] && [ "$NONINTERACTIVE" -eq 0 ]; then
        local install_docker
        read -r -p "  Install Docker Engine? [y/N]: " install_docker || true
        if [[ ! "${install_docker:-}" =~ ^[Yy]$ ]]; then
            log_info "Docker skipped."
            return
        fi
    fi
    if [ "$SELECTED_RUNTIME" != "docker" ] && [ "$NONINTERACTIVE" -eq 1 ]; then
        return
    fi
    log_info "Installing Docker Engine..."
    curl -fsSL https://get.docker.com | sudo sh
    start_docker_engine
    sudo usermod -aG docker "${SUDO_USER:-$USER}" 2>/dev/null || true
    if ! command -v docker &>/dev/null; then
        log_error "Docker install failed."
        exit 1
    fi
    log_success "Docker Engine installed."
}

is_app_root() {
    [ -f "package.json" ] && grep -qE '"name"[[:space:]]*:[[:space:]]*"rhlz-panel"' package.json 2>/dev/null
}

prepare_repository() {
    log_info "Preparing application workspace..."
    if is_app_root; then
        PROJECT_DIR="$(pwd)"
        log_info "Using current workspace: ${PROJECT_DIR}"
        return
    fi
    if [ -f "rhlz-panel/package.json" ] && grep -qE '"name"[[:space:]]*:[[:space:]]*"rhlz-panel"' rhlz-panel/package.json 2>/dev/null; then
        PROJECT_DIR="$(pwd)/rhlz-panel"
        cd "$PROJECT_DIR"
        log_info "Using nested rhlz-panel/: ${PROJECT_DIR}"
        return
    fi
    log_info "Cloning ${REPO_URL}..."
    git clone "$REPO_URL" rhlz-src-tmp
    if [ -f "rhlz-src-tmp/package.json" ] && grep -q rhlz-panel rhlz-src-tmp/package.json; then
        mv rhlz-src-tmp rhlz-panel
    elif [ -f "rhlz-src-tmp/rhlz-panel/package.json" ]; then
        mv rhlz-src-tmp/rhlz-panel rhlz-panel
        rm -rf rhlz-src-tmp
    else
        mv rhlz-src-tmp rhlz-panel
    fi
    PROJECT_DIR="$(pwd)/rhlz-panel"
    cd "$PROJECT_DIR"
}

env_has_key() {
    grep -qE "^${1}=" .env 2>/dev/null
}

merge_env_key() {
    local key="$1" val="$2"
    if [ -f .env ] && env_has_key "$key"; then
        return
    fi
    if [ -f .env ]; then
        printf '\n%s=%s\n' "$key" "$val" >> .env
    fi
}

setup_environment() {
    local target_port=$1
    local run_mode=$2
    log_info "Initializing environment..."
    mkdir -p .data/servers .data/temp .data/logs backups .logs 2>/dev/null || true

    local secret=""
    if [ -n "${RHLZ_SESSION_SECRET:-}" ]; then
        secret="$RHLZ_SESSION_SECRET"
    elif [ -f .env ] && env_has_key RHLZ_SESSION_SECRET; then
        secret=""
    elif [ -f .env ] && env_has_key JWT_SECRET; then
        secret=""
    else
        secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    fi

    if [ ! -f .env ]; then
        cat > .env <<EOF
# RHLZ Panel Configuration
NODE_ENV=${run_mode}
PORT=${target_port}
RHLZ_SESSION_SECRET=${secret}
JWT_SECRET=${secret}
DEFAULT_RUNTIME=${SELECTED_RUNTIME:-docker}
ENABLE_DOCKER=$([ "${SELECTED_RUNTIME:-docker}" = "docker" ] && echo "true" || echo "false")
PANEL_RUNTIME_MODE=${SELECTED_RUNTIME:-docker}
PANEL_RUNTIME_LOCKED=${RUNTIME_LOCKED:-true}
PANEL_THEME=${SELECTED_THEME:-red}
DEV_MODE=$([ "$run_mode" = "development" ] && echo "true" || echo "false")
PANEL_DEV_MODE=$([ "$run_mode" = "development" ] && echo "true" || echo "false")
EOF
        chmod 600 .env 2>/dev/null || true
    else
        log_info ".env exists — merging missing keys only (secrets preserved)."
        merge_env_key NODE_ENV "$run_mode"
        merge_env_key PORT "$target_port"
        if [ -n "$secret" ]; then
            merge_env_key RHLZ_SESSION_SECRET "$secret"
            merge_env_key JWT_SECRET "$secret"
        fi
        merge_env_key DEFAULT_RUNTIME "${SELECTED_RUNTIME:-docker}"
        merge_env_key ENABLE_DOCKER "$([ "${SELECTED_RUNTIME:-docker}" = "docker" ] && echo "true" || echo "false")"
        merge_env_key PANEL_RUNTIME_MODE "${SELECTED_RUNTIME:-docker}"
        merge_env_key PANEL_RUNTIME_LOCKED "${RUNTIME_LOCKED:-true}"
        merge_env_key PANEL_THEME "${SELECTED_THEME:-red}"
    fi

    DEFAULT_RUNTIME="${SELECTED_RUNTIME:-docker}" PANEL_RUNTIME_LOCKED="${RUNTIME_LOCKED:-true}" PANEL_THEME="${SELECTED_THEME:-red}" node -e '
      const fs = require("fs");
      const path = ".data/settings.json";
      let s = {};
      try { if (fs.existsSync(path)) s = JSON.parse(fs.readFileSync(path, "utf8")); } catch(e){}
      s.defaultRuntime = process.env.DEFAULT_RUNTIME || "docker";
      s.runtimeLocked = process.env.PANEL_RUNTIME_LOCKED === "true";
      if (process.env.PANEL_THEME) s.theme = process.env.PANEL_THEME;
      fs.writeFileSync(path, JSON.stringify(s, null, 2));
    ' 2>/dev/null || true

    log_success "Environment configured on port ${target_port}."
}

build_application() {
    if [ "$SKIP_BUILD" -eq 1 ] && [ -f dist/server.cjs ]; then
        log_info "Reusing existing dist/ (--skip-build)."
        return
    fi
    log_info "Installing NPM dependencies..."
    if [ "$DEV_MODE" -eq 1 ]; then
        npm install --no-audit --no-fund --quiet
        return
    fi
    npm ci --omit=dev --no-optional --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund --quiet
    log_info "Building..."
    npm run build
    log_success "Build succeeded."
}

configure_pm2_service() {
    local target_port=$1
    log_info "Configuring pm2 process ${PM2_NAME}..."
    if ! command -v pm2 &>/dev/null; then
        sudo npm install -g pm2 2>/dev/null || npm install -g pm2 2>/dev/null || true
    fi
    npx pm2 delete raven-hub 2>/dev/null || true
    npx pm2 delete raven-panel 2>/dev/null || true
    npx pm2 delete rhlz-panel 2>/dev/null || true

    PORT="${target_port}" NODE_ENV=production NODE_OPTIONS="--max-old-space-size=96" \
        npx pm2 start "dist/server.cjs" --name "${PM2_NAME}" --update-env
    npx pm2 save 2>/dev/null || true

    if command -v crontab &>/dev/null; then
        ( crontab -l 2>/dev/null | grep -v "pm2 resurrect" ; echo "@reboot $(command -v pm2 || echo npx pm2) resurrect" ) | crontab - 2>/dev/null || true
        log_info "Added '@reboot pm2 resurrect' cron (no systemd)."
    else
        log_warning "crontab not found — use Docker restart policy for persistence."
    fi
    log_success "PM2 service '${PM2_NAME}' registered."
}

has_owner_user() {
    [ -f .data/users.json ] && node -e '
      const fs=require("fs");
      try {
        const u=JSON.parse(fs.readFileSync(".data/users.json","utf8"));
        process.exit(Array.isArray(u)&&u.some(x=>x.role==="owner"||x.role==="admin")?0:1);
      } catch(e){ process.exit(1); }
    ' 2>/dev/null
}

create_initial_admin() {
    if [ -n "$ADMIN_USER" ] && [ -n "$ADMIN_PASS" ]; then
        npm run createuser -- "$ADMIN_USER" "$ADMIN_PASS"
        return
    fi
    if [ "$NONINTERACTIVE" -eq 1 ]; then
        if has_owner_user; then
            log_info "Owner account already present; skipping --admin."
            return
        fi
        log_error "Non-interactive install requires --admin USER:PASS (or RHLZ_ADMIN_USER/RHLZ_ADMIN_PASS) when no owner exists."
        exit 1
    fi
    echo ""
    npm run createuser || true
}

print_success() {
    local server_ip port="$1"
    server_ip=$(get_public_ip)
    echo ""
    echo -e "${C_EMERALD}${C_BOLD}  ${PANEL_TITLE} INSTALLED SUCCESSFULLY${C_RESET}"
    echo -e "  Panel URL:     ${C_VIBRANT_CYAN}http://${server_ip}:${port}${C_RESET}"
    echo -e "  Local URL:     ${C_VIBRANT_CYAN}http://localhost:${port}${C_RESET}"
    echo -e "  PM2 name:      ${C_AMBER}${PM2_NAME}${C_RESET}"
    echo -e "  Admin user:    ${C_WHITE}${ADMIN_USER:-existing}${C_RESET}"
    echo -e "  Runtime:       ${SELECTED_RUNTIME}  Theme: ${SELECTED_THEME}"
    echo ""
    echo -e "  ${C_MUTED}npx pm2 logs ${PM2_NAME}${C_RESET}"
    echo -e "  ${C_MUTED}npx pm2 restart ${PM2_NAME}${C_RESET}"
    echo -e "  ${C_MUTED}bash update.sh --yes${C_RESET}"
    echo -e "  ${C_MUTED}bash uninstall.sh --yes${C_RESET}"
    echo ""
}

install_production() {
    print_banner
    echo -e " ${BG_GREEN}${C_BOLD} [ PRODUCTION ] ${C_RESET} port ${TARGET_PORT}\n"
    check_root
    setup_system_dependencies
    ensure_nodejs
    prompt_runtime_configuration
    prompt_theme_selection
    prepare_repository
    install_java_host
    install_docker_engine
    setup_environment "$TARGET_PORT" "production"
    build_application
    configure_pm2_service "$TARGET_PORT"
    create_initial_admin
    print_success "$TARGET_PORT"
}

install_development() {
    print_banner
    echo -e " ${BG_AMBER}${C_BOLD} [ DEVELOPMENT ] ${C_RESET} port ${TARGET_PORT}\n"
    setup_system_dependencies
    ensure_nodejs
    prompt_runtime_configuration
    prompt_theme_selection
    prepare_repository
    setup_environment "$TARGET_PORT" "development"
    npm install --no-audit --no-fund --quiet
    create_initial_admin
    log_success "Development workspace ready. Start with: npm run dev"
}

interactive_menu() {
    while true; do
        print_banner
        echo -e "  ${C_DEEP_BLUE}[ 1 ]${C_RESET} Install production (port ${DEFAULT_PROD_PORT})"
        echo -e "  ${C_DEEP_BLUE}[ 2 ]${C_RESET} Development setup (port ${DEFAULT_DEV_PORT})"
        echo -e "  ${C_DEEP_BLUE}[ 3 ]${C_RESET} Update"
        echo -e "  ${C_DEEP_BLUE}[ 4 ]${C_RESET} Create / reset owner"
        echo -e "  ${C_DEEP_BLUE}[ 5 ]${C_RESET} Restart ${PM2_NAME}"
        echo -e "  ${C_DEEP_BLUE}[ 6 ]${C_RESET} Uninstall"
        echo -e "  ${C_DEEP_BLUE}[ 7 ]${C_RESET} Exit"
        echo ""
        local option
        read -r -p "  Select [1-7]: " option || true
        option=$(echo "${option:-}" | tr -d ' ')
        case "$option" in
            1) TARGET_PORT="${TARGET_PORT:-$DEFAULT_PROD_PORT}"; install_production; read -r -p "  Press Enter..." _ || true ;;
            2) DEV_MODE=1; TARGET_PORT="${TARGET_PORT:-$DEFAULT_DEV_PORT}"; install_development; read -r -p "  Press Enter..." _ || true ;;
            3) bash update.sh; read -r -p "  Press Enter..." _ || true ;;
            4) npm run createuser || (cd rhlz-panel && npm run createuser); read -r -p "  Press Enter..." _ || true ;;
            5) npx pm2 restart "${PM2_NAME}" 2>/dev/null || true; log_success "Restarted."; read -r -p "  Press Enter..." _ || true ;;
            6) bash uninstall.sh; exit 0 ;;
            7) exit 0 ;;
            *) log_error "Invalid selection." ;;
        esac
    done
}

parse_args "$@"
if [ "$SHOW_HELP" -eq 1 ]; then
    usage
    exit 0
fi
if [ "${RHLZ_NONINTERACTIVE:-}" = "1" ]; then
    NONINTERACTIVE=1
fi
if ! is_tty; then
    NONINTERACTIVE=1
fi

if [ "$DEV_MODE" -eq 1 ]; then
    TARGET_PORT="${TARGET_PORT:-$DEFAULT_DEV_PORT}"
else
    TARGET_PORT="${TARGET_PORT:-$DEFAULT_PROD_PORT}"
fi

if [ "$NONINTERACTIVE" -eq 1 ] || [ "$DEV_MODE" -eq 1 ]; then
    if [ "$DEV_MODE" -eq 1 ] && [ "$NONINTERACTIVE" -eq 0 ]; then
        install_development
    elif [ "$DEV_MODE" -eq 1 ]; then
        install_development
    else
        install_production
    fi
    exit 0
fi

interactive_menu
