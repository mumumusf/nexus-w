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
    async startNodes(nodeIds, nodeCount) {
        console.log(`\n🚀 启动 ${nodeCount} 个节点...`);
        
        const activeScreens = [];
        
        for (let i = 0; i < nodeCount; i++) {
            const sessionName = `nexus_node_${i}`;
            const currentNodeId = nodeIds[i];
            
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

    // 查看节点日志
    async viewNodeLog(sessionName, nodeId) {
        console.log(`\n📋 查看节点日志 (Session: ${sessionName}, Node ID: ${nodeId})`);
        console.log('按 Ctrl+C 返回主菜单\n');
        
        try {
            // 使用screen -r连接到会话，然后立即分离并显示输出
            const screenCmd = `screen -S ${sessionName} -p 0 -X hardcopy /tmp/${sessionName}_log.txt && cat /tmp/${sessionName}_log.txt`;
            const output = execSync(screenCmd, { encoding: 'utf8' });
            console.log(output);
            
            // 清理临时文件
            execSync(`rm -f /tmp/${sessionName}_log.txt`, { stdio: 'ignore' });
        } catch (error) {
            console.log(`❌ 无法获取节点日志: ${error.message}`);
        }
    }

    // 交互菜单
    async interactiveMenu(activeSessions, nodeIds) {
        while (true) {
            console.log('\n' + '='.repeat(50));
            console.log('🎛️  节点管理菜单');
            console.log('='.repeat(50));
            console.log('1. 查看所有节点状态');
            console.log('2. 查看节点日志');
            console.log('3. 连接到节点 (进入screen会话)');
            console.log('4. 停止所有节点');
            console.log('5. 退出菜单');
            console.log('='.repeat(50));
            
            const choice = await this.getUserInput('请选择操作 (1-5): ');
            
            switch (choice) {
                case '1':
                    this.showNodeStatus(activeSessions, nodeIds);
                    break;
                    
                case '2':
                    await this.selectNodeForLog(activeSessions, nodeIds);
                    break;
                    
                case '3':
                    await this.connectToNode(activeSessions, nodeIds);
                    break;
                    
                case '4':
                    await this.stopAllNodes();
                    return;
                    
                case '5':
                    console.log('\n👋 退出管理菜单，节点继续在后台运行');
                    console.log('使用以下命令管理节点:');
                    console.log('   查看状态: screen -ls');
                    console.log('   连接节点: screen -r nexus_node_<编号>');
                    console.log('   停止所有: ./stop_all_nodes.sh');
                    return;
                    
                default:
                    console.log('❌ 无效选择，请重新输入');
            }
        }
    }

    // 显示节点状态
    showNodeStatus(activeSessions, nodeIds) {
        console.log('\n📊 当前节点状态:');
        console.log('-'.repeat(60));
        
        activeSessions.forEach((session, index) => {
            try {
                // 检查screen会话是否还在运行
                execSync(`screen -list | grep ${session}`, { stdio: 'ignore' });
                console.log(`✅ 节点 ${index + 1}: ${session} (Node ID: ${nodeIds[index]}) - 运行中`);
            } catch (error) {
                console.log(`❌ 节点 ${index + 1}: ${session} (Node ID: ${nodeIds[index]}) - 已停止`);
            }
        });
        
        console.log('-'.repeat(60));
    }

    // 选择节点查看日志
    async selectNodeForLog(activeSessions, nodeIds) {
        console.log('\n📋 选择要查看日志的节点:');
        
        activeSessions.forEach((session, index) => {
            console.log(`${index + 1}. ${session} (Node ID: ${nodeIds[index]})`);
        });
        
        const nodeChoice = await this.getUserInput(`请选择节点 (1-${activeSessions.length}): `);
        const nodeIndex = parseInt(nodeChoice) - 1;
        
        if (nodeIndex >= 0 && nodeIndex < activeSessions.length) {
            await this.viewNodeLog(activeSessions[nodeIndex], nodeIds[nodeIndex]);
        } else {
            console.log('❌ 无效选择');
        }
    }

    // 连接到节点
    async connectToNode(activeSessions, nodeIds) {
        console.log('\n🔗 选择要连接的节点:');
        
        activeSessions.forEach((session, index) => {
            console.log(`${index + 1}. ${session} (Node ID: ${nodeIds[index]})`);
        });
        
        const nodeChoice = await this.getUserInput(`请选择节点 (1-${activeSessions.length}): `);
        const nodeIndex = parseInt(nodeChoice) - 1;
        
        if (nodeIndex >= 0 && nodeIndex < activeSessions.length) {
            console.log(`\n🔗 连接到 ${activeSessions[nodeIndex]}...`);
            console.log('💡 提示: 使用 Ctrl+A, D 从会话分离并返回菜单');
            console.log('按回车继续...');
            await this.getUserInput('');
            
            // 连接到screen会话
            spawn('screen', ['-r', activeSessions[nodeIndex]], { stdio: 'inherit' });
        } else {
            console.log('❌ 无效选择');
        }
    }

    // 停止所有节点
    async stopAllNodes() {
        console.log('\n⚠️  确认要停止所有节点吗？');
        const confirm = await this.getUserInput('输入 "yes" 确认停止: ');
        
        if (confirm.toLowerCase() === 'yes') {
            try {
                execSync('./stop_all_nodes.sh', { stdio: 'inherit' });
                console.log('✅ 所有节点已停止');
            } catch (error) {
                console.log('❌ 停止节点时出错:', error.message);
            }
        } else {
            console.log('❌ 操作已取消');
        }
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
        const nodeCountInput = await this.getUserInput(
            `您最多可以运行 ${maxNodes} 个节点，请输入要运行的节点数量 (1-${maxNodes}): `
        );
        
        const nodeCount = parseInt(nodeCountInput);
        if (isNaN(nodeCount) || nodeCount < 1 || nodeCount > maxNodes) {
            console.log('❌ 无效的节点数量');
            return;
        }

        // 为每个节点获取Node ID
        const nodeIds = [];
        console.log('\n📝 请为每个节点输入不同的 Node ID:');
        
        for (let i = 0; i < nodeCount; i++) {
            const nodeId = await this.getUserInput(`请输入节点 ${i + 1} 的 Node ID: `);
            if (!nodeId || isNaN(parseInt(nodeId))) {
                console.log('❌ 无效的 Node ID');
                return;
            }
            
            // 检查是否重复
            if (nodeIds.includes(nodeId)) {
                console.log('❌ Node ID 不能重复，请重新输入');
                i--; // 重新输入当前节点
                continue;
            }
            
            nodeIds.push(nodeId);
        }
        
        console.log('\n✅ 所有Node ID收集完成:');
        nodeIds.forEach((id, index) => {
            console.log(`   节点 ${index + 1}: ${id}`);
        });
        
        // 安装Nexus CLI
        if (!await this.installNexusCLI()) {
            console.log('❌ 无法安装 Nexus CLI，请检查网络连接');
            return;
        }
        
        // 启动节点
        const activeSessions = await this.startNodes(nodeIds, nodeCount);
        
        if (activeSessions.length > 0) {
            console.log('\n🎉 节点启动完成！');
            console.log('   使用 screen -ls 查看运行状态');
            console.log('   使用 ./stop_all_nodes.sh 停止所有节点');
            
            // 启动交互菜单
            await this.interactiveMenu(activeSessions, nodeIds);
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