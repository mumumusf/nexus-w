#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const banner = require('./banner');

class NexusMiner {
    constructor() {
        this.nodeMemoryRequired = 4.5; // GB per node
        this.nodeCpuRequired = 1; // CPU cores per node
        this.nexusCliPath = path.join(process.env.HOME, '.nexus/bin/nexus-network');
    }

    // 检测系统内存（GB）
    detectMemory() {
        try {
            const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
            const memTotalMatch = memInfo.match(/MemTotal:\s+(\d+)\s+kB/);
            if (memTotalMatch) {
                const memTotalKB = parseInt(memTotalMatch[1]);
                const memTotalGB = memTotalKB / 1024 / 1024;
                return Math.round(memTotalGB * 100) / 100;
            }
            return 0;
        } catch (error) {
            console.log('❌ 无法检测内存，使用默认值 8GB');
            return 8;
        }
    }

    // 检测CPU核心数
    detectCPU() {
        try {
            const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
            const cpuCount = cpuInfo.split('\n').filter(line => line.includes('processor')).length;
            return cpuCount;
        } catch (error) {
            console.log('❌ 无法检测CPU，使用默认值 4核');
            return 4;
        }
    }

    // 计算可运行节点数量
    calculateMaxNodes() {
        const totalMemory = this.detectMemory();
        const totalCPU = this.detectCPU();
        
        console.log(`\n🔍 系统检测结果:`);
        console.log(`   内存: ${totalMemory} GB`);
        console.log(`   CPU: ${totalCPU} 核`);
        
        // 保留1GB内存给系统使用
        const availableMemory = totalMemory - 1;
        const maxNodesByMemory = Math.floor(availableMemory / this.nodeMemoryRequired);
        const maxNodesByCPU = Math.floor(totalCPU / this.nodeCpuRequired);
        
        const maxNodes = Math.min(maxNodesByMemory, maxNodesByCPU);
        
        console.log(`\n💡 节点分配分析:`);
        console.log(`   按内存计算: ${maxNodesByMemory} 个节点 (${this.nodeMemoryRequired}GB/节点)`);
        console.log(`   按CPU计算: ${maxNodesByCPU} 个节点 (${this.nodeCpuRequired}核/节点)`);
        console.log(`   推荐运行: ${maxNodes} 个节点`);
        
        return maxNodes;
    }

    // 安装Nexus CLI
    async installNexusCLI() {
        console.log('\n🔧 正在安装 Nexus CLI...');
        
        try {
            // 检查是否已经安装
            if (fs.existsSync(this.nexusCliPath)) {
                console.log('✅ Nexus CLI 已经安装');
                return true;
            }
            
            // 安装Nexus CLI
            console.log('📥 正在下载并安装 Nexus CLI...');
            execSync('curl -L https://cli.nexus.xyz | sh', { 
                stdio: 'inherit',
                shell: '/bin/bash'
            });
            
            // 验证安装
            if (fs.existsSync(this.nexusCliPath)) {
                console.log('✅ Nexus CLI 安装成功');
                return true;
            } else {
                console.log('❌ Nexus CLI 安装失败');
                return false;
            }
        } catch (error) {
            console.log('❌ 安装 Nexus CLI 时出错:', error.message);
            return false;
        }
    }

    // 检查screen是否安装
    checkScreenInstalled() {
        try {
            execSync('which screen', { stdio: 'ignore' });
            return true;
        } catch (error) {
            return false;
        }
    }

    // 安装screen
    installScreen() {
        try {
            console.log('🔧 正在安装 screen...');
            execSync('sudo apt-get update && sudo apt-get install -y screen', { stdio: 'inherit' });
            console.log('✅ screen 安装成功');
            return true;
        } catch (error) {
            console.log('❌ screen 安装失败:', error.message);
            return false;
        }
    }

    // 创建启动脚本
    createStartScript(nodeId, nodeIndex) {
        const scriptPath = path.join(process.cwd(), `start_node_${nodeIndex}.sh`);
        const scriptContent = `#!/bin/bash
export NODE_ID=${nodeId}
export NODE_INDEX=${nodeIndex}
echo "启动节点 $NODE_INDEX, Node ID: $NODE_ID"
cd $HOME
${this.nexusCliPath} start --node-id $NODE_ID
`;
        
        fs.writeFileSync(scriptPath, scriptContent);
        execSync(`chmod +x ${scriptPath}`);
        return scriptPath;
    }

    // 启动节点
    async startNodes(nodeId, nodeCount) {
        console.log(`\n🚀 启动 ${nodeCount} 个节点...`);
        
        const activeScreens = [];
        
        for (let i = 0; i < nodeCount; i++) {
            const sessionName = `nexus_node_${i}`;
            const currentNodeId = parseInt(nodeId) + i;
            
            try {
                // 创建启动脚本
                const scriptPath = this.createStartScript(currentNodeId, i);
                
                // 创建screen会话
                const screenCmd = `screen -dmS ${sessionName} bash ${scriptPath}`;
                execSync(screenCmd);
                
                activeScreens.push(sessionName);
                console.log(`✅ 节点 ${i} 启动成功 (Node ID: ${currentNodeId}, Session: ${sessionName})`);
                
                // 等待一秒避免同时启动过多进程
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.log(`❌ 节点 ${i} 启动失败:`, error.message);
            }
        }
        
        console.log(`\n📊 启动完成! 总计 ${activeScreens.length} 个节点正在运行`);
        this.showManagementCommands(activeScreens);
        
        return activeScreens;
    }

    // 显示管理命令
    showManagementCommands(sessions) {
        console.log('\n🎛️  节点管理命令:');
        console.log('   查看所有会话: screen -ls');
        console.log('   连接到节点: screen -r <session_name>');
        console.log('   从会话分离: Ctrl+A, D');
        console.log('   停止节点: screen -S <session_name> -X quit');
        console.log('   停止所有节点: ./stop_all_nodes.sh');
        
        // 创建停止所有节点的脚本
        const stopScript = sessions.map(session => 
            `screen -S ${session} -X quit`
        ).join('\n');
        
        fs.writeFileSync('stop_all_nodes.sh', `#!/bin/bash\n${stopScript}\necho "所有节点已停止"`);
        execSync('chmod +x stop_all_nodes.sh');
        
        console.log('\n活跃会话列表:');
        sessions.forEach((session, index) => {
            console.log(`   ${index}: ${session}`);
        });
    }

    // 获取用户输入
    async getUserInput(question) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        return new Promise((resolve) => {
            rl.question(question, (answer) => {
                rl.close();
                resolve(answer);
            });
        });
    }

    // 主函数
    async run() {
        console.log(banner);
        
        // 检查是否为Ubuntu系统
        try {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
            if (!osRelease.includes('ubuntu')) {
                console.log('⚠️  警告: 此脚本专为 Ubuntu 系统设计');
            }
        } catch (error) {
            console.log('⚠️  警告: 无法检测系统版本');
        }
        
        // 检查screen是否安装
        if (!this.checkScreenInstalled()) {
            console.log('📦 检测到未安装 screen，正在安装...');
            if (!this.installScreen()) {
                console.log('❌ 无法安装 screen，请手动安装后重试');
                return;
            }
        }
        
        // 计算最大节点数
        const maxNodes = this.calculateMaxNodes();
        
        if (maxNodes <= 0) {
            console.log('❌ 系统资源不足，无法运行节点');
            return;
        }
        
        // 获取用户输入
        const nodeId = await this.getUserInput(`\n请输入您的 Node ID (例如: 6520503): `);
        if (!nodeId || isNaN(parseInt(nodeId))) {
            console.log('❌ 无效的 Node ID');
            return;
        }
        
        const nodeCountInput = await this.getUserInput(
            `您最多可以运行 ${maxNodes} 个节点，请输入要运行的节点数量 (1-${maxNodes}): `
        );
        
        const nodeCount = parseInt(nodeCountInput);
        if (isNaN(nodeCount) || nodeCount < 1 || nodeCount > maxNodes) {
            console.log('❌ 无效的节点数量');
            return;
        }
        
        // 安装Nexus CLI
        if (!await this.installNexusCLI()) {
            console.log('❌ 无法安装 Nexus CLI，请检查网络连接');
            return;
        }
        
        // 启动节点
        const activeSessions = await this.startNodes(nodeId, nodeCount);
        
        if (activeSessions.length > 0) {
            console.log('\n🎉 节点启动完成！');
            console.log('   使用 screen -ls 查看运行状态');
            console.log('   使用 ./stop_all_nodes.sh 停止所有节点');
        } else {
            console.log('❌ 没有成功启动任何节点');
        }
    }
}

// 运行脚本
if (require.main === module) {
    const miner = new NexusMiner();
    miner.run().catch(console.error);
}

module.exports = NexusMiner; 