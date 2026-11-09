import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const port=Number(process.env.BROWSER_TEST_PORT||4173);
const hasEdge=process.platform==='win32'&&[process.env.PROGRAMFILES,process.env['PROGRAMFILES(X86)']]
  .filter(Boolean).some(dir=>existsSync(join(dir,'Microsoft/Edge/Application/msedge.exe')));
export default defineConfig({
  testDir:'./e2e',
  fullyParallel:true,
  workers:2,
  retries:0,
  timeout:30000,
  expect:{timeout:5000},
  forbidOnly:!!process.env.CI,
  outputDir:'browser-results/artifacts',
  reporter:[['list'],['html',{outputFolder:'browser-results/report',open:'never'}],['json',{outputFile:'browser-results/results.json'}]],
  use:{
    baseURL:`http://127.0.0.1:${port}/hengchao-beasts/`,
    browserName:'chromium',
    channel:process.env.BROWSER_TEST_CHANNEL||(hasEdge?'msedge':undefined),
    screenshot:'only-on-failure',
    trace:'retain-on-failure',
    actionTimeout:5000,
  },
  projects:[
    {name:'desktop',use:{viewport:{width:1280,height:800}}},
    {name:'mobile-390',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}},
  ],
  webServer:{
    command:'node scripts/serve-browser-tests.mjs',
    url:`http://127.0.0.1:${port}/hengchao-beasts/`,
    env:{BROWSER_TEST_PORT:String(port)},
    reuseExistingServer:false,
    timeout:10000,
  },
});
