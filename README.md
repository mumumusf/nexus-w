# Nexus 节点挖矿脚本

一个自动化的 Nexus 节点挖矿脚本，支持多节点管理和资源自动检测。

## 部署说明

### 1. 克隆项目

```bash
git clone https://github.com/mumumusf/nexus-w.git
cd nexus-w
```

### 2. 安装Node.js (如果没有)

```bash
# 下载并安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc   # 如果使用 bash
source ~/.zshrc    # 如果使用 zsh

# 安装 Node.js 22
nvm install 22
nvm list

# 使用 Node.js 22
nvm use 22
nvm alias default 22

# 验证安装
node -v   # 预期输出: v22.13.1
nvm current # 预期输出: v22.13.1
npm -v    # 预期输出: 10.9.2
```

### 3. 运行脚本

```bash
# 给脚本执行权限
chmod +x nexus-miner.js

# 运行脚本
node nexus-miner.js
```

### 4. 按提示操作

- 输入您的 Node ID
- 选择要运行的节点数量
- 脚本将自动安装依赖并启动节点

## 管理命令

```bash
# 查看运行状态
screen -ls

# 连接到节点
screen -r nexus_node_0

# 停止所有节点
./stop_all_nodes.sh
``` 