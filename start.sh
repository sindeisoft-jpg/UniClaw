#!/usr/bin/env bash
set -euo pipefail

# OpenClaw 启动脚本
# 用户点击即可运行本项目

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# macOS：打开系统设置中的「完全磁盘访问」等权限页，便于用户为终端授权
request_macos_terminal_permissions() {
    if [[ "$(uname -s)" != "Darwin" ]]; then
        return 0
    fi
    log_info "正在打开系统设置中的完全磁盘访问页面，请将「终端」或当前终端应用加入列表并开启权限。"
    log_info "界面路径（中文）：系统设置 → 隐私与安全性 → 完全磁盘访问"
    log_info "界面路径（English）：System Settings → Privacy & Security → Full Disk Access"
    if open -g "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles" 2>/dev/null; then
        log_info "若已授权可忽略；授权后若仍有权限问题，请重启终端后再运行本脚本。"
    else
        log_info "请手动打开：系统设置 → 隐私与安全性 → 完全磁盘访问（或 System Settings → Privacy & Security → Full Disk Access），添加「终端」并开启。"
    fi
    echo ""
}

# macOS：在启动时做一次受保护目录访问，以尽早触发系统权限弹窗（若尚未授权）
trigger_macos_permission_prompt() {
    if [[ "$(uname -s)" != "Darwin" ]]; then
        return 0
    fi
    log_info "正在检查系统权限（若弹出授权对话框，请点击「打开」或「允许」以便网关后续可正常执行命令）。"
    if node -e "require('fs').readdirSync(process.env.HOME + '/Library')" 2>/dev/null; then
        log_success "系统权限检查通过"
    else
        log_info "若刚才出现了系统授权弹窗，请在其中允许终端/当前应用的访问；未弹窗则可能已授权或当前环境无需该权限。"
    fi
    echo ""
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v "$1" &> /dev/null; then
        log_error "缺少必要命令: $1"
        return 1
    fi
    return 0
}

# 检查 Node.js 版本
check_node_version() {
    local required_version=22
    local current_version
    current_version=$(node -v | cut -d'.' -f1 | tr -d 'v')
    
    if [ "$current_version" -lt "$required_version" ]; then
        log_error "Node.js 版本过低。需要 v${required_version}+，当前为 v${current_version}"
        log_info "请从 https://nodejs.org/ 安装 Node.js v${required_version}+"
        return 1
    fi
    log_success "Node.js 版本检查通过 (v${current_version})"
    return 0
}

# 主函数
main() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}      OpenClaw 启动脚本                ${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    # macOS：打开系统设置，便于用户为终端授予完全磁盘访问等权限
    request_macos_terminal_permissions

    # 检查当前目录
    if [ ! -f "package.json" ]; then
        log_error "请在 OpenClaw 项目根目录运行此脚本"
        exit 1
    fi
    
    # 检查必要命令
    log_info "检查系统依赖..."
    check_command "node" || exit 1
    check_command "npm" || exit 1
    check_node_version || exit 1
    
    # macOS：尽早触发系统权限弹窗（若尚未授权）
    trigger_macos_permission_prompt

    # 检查 pnpm
    if ! command -v pnpm &> /dev/null; then
        log_warning "未检测到 pnpm，正在安装..."
        npm install -g pnpm
        if [ $? -ne 0 ]; then
            log_error "pnpm 安装失败"
            exit 1
        fi
        log_success "pnpm 安装成功"
    else
        log_success "pnpm 已安装"
    fi
    
    # 检查依赖是否已安装
    if [ ! -d "node_modules" ]; then
        log_info "安装项目依赖..."
        pnpm install
        if [ $? -ne 0 ]; then
            log_error "依赖安装失败"
            exit 1
        fi
        log_success "依赖安装完成"
    else
        log_success "依赖已安装"
    fi
    
    # 检查是否需要构建
    if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
        log_info "构建项目..."
        pnpm build
        if [ $? -ne 0 ]; then
            log_error "构建失败"
            exit 1
        fi
        log_success "构建完成"
    else
        log_success "项目已构建"
    fi
    
    # 检查 UI 构建
    if [ ! -d "ui/dist" ]; then
        log_info "构建 UI..."
        pnpm ui:build
        if [ $? -ne 0 ]; then
            log_warning "UI 构建失败，但将继续运行"
        else
            log_success "UI 构建完成"
        fi
    fi
    
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}      选择运行模式                     ${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    echo "1. 开发模式 (自动重载)"
    echo "2. 网关开发模式"
    echo "3. 运行初始化向导 (首次使用推荐)"
    echo "4. 运行网关"
    echo "5. 运行 CLI"
    echo "6. 退出"
    echo ""
    
    read -p "请选择 (1-6): " choice
    
    case $choice in
        1)
            log_info "启动开发模式..."
            pnpm dev
            ;;
        2)
            log_info "启动网关开发模式..."
            pnpm gateway:dev
            ;;
        3)
            log_info "运行初始化向导..."
            log_info "请按照向导提示完成设置"
            pnpm openclaw onboard
            ;;
        4)
            log_info "启动网关..."
            pnpm openclaw gateway run
            ;;
        5)
            log_info "启动 CLI..."
            echo "输入 'exit' 退出 CLI"
            pnpm openclaw
            ;;
        6)
            log_info "退出"
            exit 0
            ;;
        *)
            log_error "无效选择"
            exit 1
            ;;
    esac
}

# 处理中断信号
trap 'echo -e "\n${YELLOW}[INFO]${NC} 脚本被中断"; exit 1' INT

# 运行主函数
main