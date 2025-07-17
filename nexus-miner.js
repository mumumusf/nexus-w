#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const banner = require('./banner');

class NexusMiner {
    constructor() {
        this.nodeMemoryRequired = 3.5; // GB per node (从4.5优化到3.5)
        this.systemReservedMemory = 2; // GB 为系统保留更多内存
        this.nexusCliPath = path.join(process.env.HOME, '.nexus/bin/nexus-network');
    }

    // 检测系统内存（GB）
    detectMemory() {
        try {
            const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
            const memTotalMatch = memInfo.match(/MemTotal:\s+(\d+)\s+kB/);
            const memAvailableMatch = memInfo.match(/MemAvailable:\s+(\d+)\s+kB/);
            
            if (memTotalMatch) {
                const memTotalKB = parseInt(memTotalMatch[1]);
                const memTotalGB = memTotalKB / 1024 / 1024;
                
                let memAvailableGB = memTotalGB;
                if (memAvailableMatch) {
                    const memAvailableKB = parseInt(memAvailableMatch[1]);
                    memAvailableGB = memAvailableKB / 1024 / 1024;
                }
                
                return {
                    total: Math.round(memTotalGB * 100) / 100,
                    available: Math.round(memAvailableGB * 100) / 100
                };
            }
            return { total: 8, available: 6 };
        } catch (error) {
            console.log('❌ 无法检测内存，使用默认值');
            return { total: 8, available: 6 };
        }
    }

    // 检测CPU核心数（仅用于信息显示）
    detectCPU() {
        try {
            const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
            const cpuCount = cpuInfo.split('\n').filter(line => line.includes('processor')).length;
            return cpuCount;
        } catch (error) {
            return 4;
        }
    }

    // 获取当前内存使用情况
    getCurrentMemoryUsage() {
        try {
            const memInfo = fs.readFileSync('/proc/meminfo', 'utf8');
            const memTotalMatch = memInfo.match(/MemTotal:\s+(\d+)\s+kB/);
            const memFreeMatch = memInfo.match(/MemFree:\s+(\d+)\s+kB/);
            const buffersMatch = memInfo.match(/Buffers:\s+(\d+)\s+kB/);
            const cachedMatch = memInfo.match(/Cached:\s+(\d+)\s+kB/);
            
            if (memTotalMatch && memFreeMatch) {
                const total = parseInt(memTotalMatch[1]) / 1024 / 1024;
                const free = parseInt(memFreeMatch[1]) / 1024 / 1024;
                const buffers = buffersMatch ? parseInt(buffersMatch[1]) / 1024 / 1024 : 0;
                const cached = cachedMatch ? parseInt(cachedMatch[1]) / 1024 / 1024 : 0;
                
                const used = total - free - buffers - cached;
                const usagePercent = (used / total) * 100;
                
                return {
                    total: Math.round(total * 100) / 100,
                    used: Math.round(used * 100) / 100,
                    free: Math.round((free + buffers + cached) * 100) / 100,
                    usagePercent: Math.round(usagePercent * 100) / 100
                };
            }
        } catch (error) {
            return null;
        }
    }

    // 内存检测和节点数量建议（非强制）
    calculateRecommendedNodes() {
        const memory = this.detectMemory();
        const totalCPU = this.detectCPU();
        
        console.log(`\n🔍 系统检测结果:`);
        console.log(`   总内存: ${memory.total} GB`);
        console.log(`   可用内存: ${memory.available} GB`);
        console.log(`   CPU核心: ${totalCPU} 核 (仅供参考)`);
        
        // 基于可用内存计算建议值，而不是总内存
        const usableMemory = memory.available - this.systemReservedMemory;
        const recommendedNodes = Math.floor(usableMemory / this.nodeMemoryRequired);
        
        console.log(`\n💡 内存分配建议:`);
        console.log(`   系统保留: ${this.systemReservedMemory} GB`);
        console.log(`   可分配内存: ${usableMemory} GB`);
        console.log(`   每节点建议需求: ${this.nodeMemoryRequired} GB`);
        console.log(`   建议节点数: ${Math.max(0, recommendedNodes)} 个`);
        
        if (recommendedNodes <= 0) {
            console.log(`⚠️  内存不足警告: 系统内存较少，建议配置至少 ${this.nodeMemoryRequired + this.systemReservedMemory} GB 内存`);
            console.log(`   您仍可以尝试运行少量节点，但可能影响性能`);
        } else if (recommendedNodes < 2) {
            console.log(`⚠️  性能提示: 建议增加系统内存以获得更好的挖矿效果`);
        }
        
        return {
            recommended: Math.max(0, recommendedNodes),
            available: memory.available,
            total: memory.total
        };
    }



    // 内存优化建议
    showMemoryOptimizationTips() {
        console.log('\n🚀 内存优化建议:');
        console.log('   1. 关闭不必要的系统服务');
        console.log('   2. 清理系统缓存: sudo sync && sudo sysctl vm.drop_caches=3');
        console.log('   3. 增加交换空间(swap)以防止内存不足');
        console.log('   4. 监控节点内存使用，及时调整节点数量');
        console.log('   5. 考虑使用更大内存的服务器');
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

    // 创建启动脚本（优化内存使用）
    createStartScript(nodeId, nodeIndex) {
        const scriptPath = path.join(process.cwd(), `start_node_${nodeIndex}.sh`);
        const scriptContent = `#!/bin/bash
export NODE_ID=${nodeId}
export NODE_INDEX=${nodeIndex}
echo "启动节点 $NODE_INDEX, Node ID: $NODE_ID"

# 内存优化设置
export NODE_OPTIONS="--max-old-space-size=3072"  # 限制Node.js内存使用为3GB
ulimit -m $((3 * 1024 * 1024))  # 限制进程内存使用

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
        console.log('   查看内存使用: free -h');
        console.log('   清理内存缓存: sudo sync && sudo sysctl vm.drop_caches=3');
        
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
            console.log('4. 查看内存使用情况');
            console.log('5. 内存优化建议');
            console.log('6. 停止所有节点');
            console.log('7. 退出菜单');
            console.log('='.repeat(50));
            
            const choice = await this.getUserInput('请选择操作 (1-7): ');
            
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
                    this.showMemoryStatus();
                    break;
                    
                case '5':
                    this.showMemoryOptimizationTips();
                    break;
                    
                case '6':
                    await this.stopAllNodes();
                    return;
                    
                case '7':
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

    // 显示内存状态
    showMemoryStatus() {
        const usage = this.getCurrentMemoryUsage();
        if (usage) {
            console.log('\n💾 当前内存状态:');
            console.log('-'.repeat(40));
            console.log(`总内存: ${usage.total} GB`);
            console.log(`已使用: ${usage.used} GB`);
            console.log(`可用: ${usage.free} GB`);
            console.log(`使用率: ${usage.usagePercent}%`);
            console.log('-'.repeat(40));
            
            if (usage.usagePercent > 80) {
                console.log('⚠️  内存使用率较高，建议关注');
            } else if (usage.usagePercent > 90) {
                console.log('🚨 内存使用率过高，建议减少节点数量');
            } else {
                console.log('✅ 内存使用正常');
            }
        } else {
            console.log('❌ 无法获取内存信息');
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
        
        // 获取内存检测结果和建议
        const memoryInfo = this.calculateRecommendedNodes();
        
        // 显示建议信息
        if (memoryInfo.recommended > 0) {
            console.log(`\n✅ 根据您的系统配置，我们建议运行 ${memoryInfo.recommended} 个节点以获得最佳性能`);
        } else {
            console.log(`\n⚠️  您的系统内存较少，建议谨慎设置节点数量，从1-2个节点开始尝试`);
        }
        
        console.log(`\n📝 请注意：`);
        console.log(`   • 建议值仅供参考，您可以根据实际需求调整`);
        console.log(`   • 运行过多节点可能导致系统卡顿或内存不足`);
        console.log(`   • 建议从少量节点开始，观察系统性能后再增加`);
        
        // 获取用户输入（不限制上限）
        const nodeCountInput = await this.getUserInput(
            `请输入要运行的节点数量 (建议: ${memoryInfo.recommended > 0 ? memoryInfo.recommended : '1-2'} 个): `
        );
        
        const nodeCount = parseInt(nodeCountInput);
        if (isNaN(nodeCount) || nodeCount < 1) {
            console.log('❌ 请输入有效的节点数量 (至少1个)');
            return;
        }
        
        // 如果超出建议值，给出警告但不阻止
        if (memoryInfo.recommended > 0 && nodeCount > memoryInfo.recommended) {
            console.log(`\n⚠️  警告: 您选择的节点数量 (${nodeCount}) 超出建议值 (${memoryInfo.recommended})`);
            console.log(`   这可能导致:`);
            console.log(`   • 系统内存不足`);
            console.log(`   • 节点运行不稳定`);
            console.log(`   • 系统响应缓慢`);
            
            const confirmInput = await this.getUserInput('确认继续吗？输入 "yes" 继续，其他任意键取消: ');
            if (confirmInput.toLowerCase() !== 'yes') {
                console.log('❌ 操作已取消，请重新选择节点数量');
                return;
            }
            console.log('⚠️  您选择了超出建议的节点数量，请密切监控系统性能');
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
            
            // 显示内存优化信息
            const memoryUsage = this.getCurrentMemoryUsage();
            if (memoryUsage) {
                console.log(`\n💾 内存优化效果:`);
                console.log(`   当前内存使用: ${memoryUsage.used}GB/${memoryUsage.total}GB (${memoryUsage.usagePercent}%)`);
                console.log(`   节点内存分配: ${nodeCount} × ${this.nodeMemoryRequired}GB = ${nodeCount * this.nodeMemoryRequired}GB`);
                console.log(`   系统保留内存: ${this.systemReservedMemory}GB`);
            }
            
            console.log('\n🎛️  管理命令:');
            console.log('   查看运行状态: screen -ls');
            console.log('   停止所有节点: ./stop_all_nodes.sh');
            
            // 显示内存优化提示
            this.showMemoryOptimizationTips();
            
            // 启动交互菜单
            await this.interactiveMenu(activeSessions, nodeIds);
        } else {
            console.log('❌ 没有成功启动任何节点');
            
            // 显示故障排除建议
            console.log('\n🔧 故障排除建议:');
            console.log('   1. 检查网络连接');
            console.log('   2. 验证Node ID是否正确');
            console.log('   3. 确保有足够的内存空间');
            console.log('   4. 检查Nexus CLI是否正确安装');
        }
    }
}

// 运行脚本
if (require.main === module) {
    const miner = new NexusMiner();
    miner.run().catch(console.error);
}

module.exports = NexusMiner; 