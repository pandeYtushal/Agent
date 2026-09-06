#!/usr/bin/env node
import { Command } from 'commander';
import readline from 'readline';
import { loadConfig } from '../config/index.js';
import { logger } from '../logger/index.js';
import { PublishingAgentEngine } from '../agent/index.js';
import { ValidationError, GitHubApiError } from '../errors/index.js';
import { startTelegramBot, sendProactiveProjectNotification } from '../telegram/index.js';
import { startWebhookServer } from '../webhook/server.js';


const program = new Command();
const config = loadConfig();

logger.setLevel(config.LOG_LEVEL);

/**
 * Helper to prompt CLI user for confirmation
 */
function promptUserConfirmation(query: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${query} (y/N): `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

program
  .name('portfolio-agent')
  .description('AI Publishing Agent for automated developer portfolio management')
  .version('0.1.0');

program
  .command('inspect-portfolio')
  .description('Inspect existing portfolio repository and determine schema, storage, assets, and integration strategy')
  .argument('[portfolio-path-or-url]', 'Local file path or GitHub URL of the portfolio repository', config.PORTFOLIO_PATH)
  .option('-j, --json', 'Output inspection result in raw JSON format')
  .action(async (target: string, options: { json?: boolean }) => {
    try {
      logger.info(`CLI command [inspect-portfolio] received for: ${target}`);
      const engine = new PublishingAgentEngine({ portfolioPath: target });
      const { schema, report } = await engine.inspectPortfolio(target);

      if (options.json) {
        console.log(JSON.stringify({ schema, report }, null, 2));
      } else {
        console.log('\n============================================================');
        console.log(` PORTFOLIO INSPECTION REPORT: ${report.summary.portfolioName}`);
        console.log('============================================================\n');

        console.log('📦 1. SUMMARY');
        console.log(`  Portfolio Name:     ${report.summary.portfolioName}`);
        console.log(`  Framework:          ${report.summary.framework}`);
        console.log(`  Build System:       ${report.summary.buildSystem}`);
        console.log(`  Deployment Target:  ${report.summary.deploymentConfig}\n`);

        console.log('📂 2. STORAGE LOCATION & ASSETS');
        console.log(`  Project Data File:  ${report.storage.projectDataFile}`);
        console.log(`  Asset Directory:    ${report.storage.assetDirectory}`);
        console.log(`  Image Format:       ${report.storage.imageFormat}`);
        console.log(`  Image Reference:    ${report.storage.imageReferenceStyle}\n`);

        console.log('📋 3. PROJECT SCHEMA & FIELDS');
        console.log(`  Total Fields:       ${report.schema.requiredFields.length} required fields`);
        console.log(`  Required Fields:    ${report.schema.requiredFields.slice(0, 8).join(', ')}...`);
        console.log(`  Ordering Rule:      ${report.schema.orderingRule}`);
        console.log(`  Featured Rule:      ${report.schema.featuredRule}`);
        console.log(`  Category Structure: ${report.schema.categoryStructure}`);
        console.log(`  Tag Structure:      ${report.schema.technologyTagStructure}\n`);

        console.log('🎨 4. RENDERING & DESIGN RULES');
        console.log(`  Component:          ${report.rendering.renderingComponent}`);
        console.log(`  Design Rules:       ${report.rendering.designRules}\n`);

        console.log('⚙️ 5. VALIDATION COMMANDS');
        console.log(`  Build Command:      ${report.validationCommands.buildCommand}`);
        console.log(`  Lint Command:       ${report.validationCommands.lintCommand || 'None'}`);
        console.log(`  Test Command:       ${report.validationCommands.testCommand || 'None'}\n`);

        console.log('🚀 6. INTEGRATION STRATEGY');
        report.integrationStrategy.forEach((step) => console.log(`  ${step}`));
        console.log('\n============================================================\n');
      }
    } catch (err: any) {
      logger.error('inspect-portfolio command failed', err);
      process.exit(1);
    }
  });

program
  .command('analyze')
  .description('Analyze a GitHub repository and extract metadata, tech stack, and assets')
  .argument('<github-url>', 'URL of the GitHub repository to analyze')
  .option('-j, --json', 'Output analysis in JSON format')
  .action(async (githubUrl: string, options: { json?: boolean }) => {
    try {
      logger.info(`CLI command [analyze] received for URL: ${githubUrl}`);
      const engine = new PublishingAgentEngine({ portfolioPath: config.PORTFOLIO_PATH });
      const analysis = await engine.analyze(githubUrl);

      if (options.json) {
        console.log(JSON.stringify(analysis, null, 2));
      } else {
        console.log('\n--- Project Analysis Result ---');
        console.log(`Repository: ${analysis.repoUrl}`);
        console.log(`Name:       ${analysis.name}`);
        console.log(`Tech Stack: ${analysis.techStack.join(', ')}`);
        console.log(`Category:   ${analysis.suggestedCategory || 'N/A'}`);
        console.log(`Features:   ${analysis.keyFeatures.join('; ')}`);
        console.log(`Assets:     ${analysis.assets.length} item(s) found`);
        console.log('-------------------------------\n');
      }
    } catch (err: any) {
      logger.error('Analyze command failed', err);
      process.exit(1);
    }
  });

program
  .command('preview')
  .description('Generate and preview proposed portfolio changes and validation checks without writing')
  .argument('<github-url>', 'URL of the GitHub repository to preview')
  .option('-j, --json', 'Output preview in JSON format')
  .action(async (githubUrl: string, options: { json?: boolean }) => {
    try {
      logger.info(`CLI command [preview] received for URL: ${githubUrl}`);
      const engine = new PublishingAgentEngine({ portfolioPath: config.PORTFOLIO_PATH });
      const preview = await engine.preview(githubUrl);

      if (options.json) {
        console.log(JSON.stringify(preview, null, 2));
      } else {
        const newEntry = preview.portfolioChange.newEntry;
        const featuresList = (newEntry.features as Array<{ title: string; desc: string }>)
          ?.map((f) => `- ${f.title}: ${f.desc}`)
          .join('\n  ') || (newEntry.whatIBuilt as string[])?.map((f) => `- ${f}`).join('\n  ');

        const filesChanging = preview.portfolioChange.modifiedFiles.map((f) => f.path);
        if (preview.portfolioChange.assetsToAdd.length > 0) {
          filesChanging.push(...preview.portfolioChange.assetsToAdd.map((a) => a.targetPath));
        }

        console.log('\nPROJECT\n');
        console.log(`Title:\n${newEntry.title}\n`);
        console.log(`Description:\n${newEntry.description}\n`);
        console.log(`Technologies:\n${(newEntry.fullTech as string[])?.join(', ')}\n`);
        console.log(`Features:\n  ${featuresList}\n`);
        console.log(`GitHub:\n${newEntry.source}\n`);
        console.log(`Live Demo:\n${newEntry.link}\n`);
        console.log(`Image:\n${newEntry.image}\n`);
        console.log(`Portfolio location:\n${config.PORTFOLIO_PATH}\n`);
        console.log(`Files that would change:\n  ${filesChanging.join('\n  ')}\n`);
      }
    } catch (err: any) {
      if (err instanceof ValidationError && err.message === 'This project already exists in the portfolio.') {
        console.log(`\n${err.message}\n`);
        process.exit(0);
      }
      logger.error('Preview command failed', err);
      process.exit(1);
    }
  });

program
  .command('add')
  .description('Add project entry to target portfolio repository with dry-run mode and build validation')
  .argument('<github-url>', 'URL of the GitHub repository to add')
  .option('-d, --dry-run', 'Preview changes and proposed code diff without modifying files')
  .option('-u, --update', 'Update project entry if duplicate is detected')
  .option('-j, --json', 'Output run result in JSON format')
  .action(async (githubUrl: string, options: { dryRun?: boolean; update?: boolean; json?: boolean }) => {
    try {
      logger.info(`CLI command [add] received for URL: ${githubUrl} (dryRun: ${!!options.dryRun})`);
      const engine = new PublishingAgentEngine({ portfolioPath: config.PORTFOLIO_PATH });
      const result = await engine.add(githubUrl, { dryRun: options.dryRun, updateExisting: options.update });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('\n============================================================');
        console.log(` PORTFOLIO MODIFICATION ${options.dryRun ? '[DRY-RUN PREVIEW]' : '[EXECUTION COMPLETED]'}`);
        console.log('============================================================\n');

        console.log('📋 MODIFICATION PLAN:');
        console.log('  Files to Create:');
        if (result.plan.filesToCreate.length === 0) {
          console.log('    (None)');
        } else {
          result.plan.filesToCreate.forEach((f) => console.log(`    + ${f.path}`));
        }

        console.log('  Files to Modify:');
        result.plan.filesToModify.forEach((f) => console.log(`    ~ ${f.path} (${f.description})`));

        console.log('  Files to Delete:');
        console.log('    (None)\n');

        console.log('🔍 PROPOSED CODE DIFF:');
        console.log(result.diff);
        console.log('\n------------------------------------------------------------');

        if (options.dryRun) {
          console.log('ℹ️  Dry-run mode active. No files were written to disk.\n');
        } else {
          console.log('✅ Local file modifications applied successfully.');
          if (result.buildValidation) {
            console.log(`✅ Target portfolio validation passed: Typecheck: ${result.buildValidation.typecheck ? 'OK' : 'FAILED'}, Lint: ${result.buildValidation.lint ? 'OK' : 'FAILED'}, Build: ${result.buildValidation.build ? 'OK' : 'FAILED'}`);
          }
          console.log('\n');
        }
      }
    } catch (err: any) {
      if (err instanceof ValidationError && err.message === 'This project already exists in the portfolio.') {
        console.log(`\n${err.message}`);
        console.log('Tip: Pass --update option to update the existing portfolio project entry.\n');
        process.exit(0);
      }
      logger.error('Add command failed', err);
      process.exit(1);
    }
  });

program
  .command('publish')
  .description('Publish project to GitHub: analyze, generate, branch, modify, validate, commit, push, and PR')
  .argument('<github-url>', 'URL of the GitHub repository to publish')
  .option('-y, --yes', 'Automatically confirm Pull Request creation non-interactively')
  .option('-u, --update', 'Update project entry if duplicate is detected')
  .option('-j, --json', 'Output publish result in JSON format')
  .action(async (githubUrl: string, options: { yes?: boolean; update?: boolean; json?: boolean }) => {
    try {
      logger.info(`CLI command [publish] received for URL: ${githubUrl}`);
      const engine = new PublishingAgentEngine({ portfolioPath: config.PORTFOLIO_PATH });

      let shouldUpdate = options.update;

      const result = await engine.publish(githubUrl, {
        updateExisting: shouldUpdate,
        confirmFn: async (details) => {
          if (options.yes) return true;

          console.log('\n============================================================');
          console.log(' Ready to publish:\n');
          console.log(` ${details.projectName}\n`);
          console.log(' Files:');
          details.files.forEach((f) => console.log(` ${f}`));
          console.log('\n Validation:');
          console.log(` ${details.validation.build ? '✓' : '✗'} Build`);
          console.log(` ${details.validation.typecheck ? '✓' : '✗'} Typecheck`);
          console.log(` ${details.validation.lint ? '✓' : '✗'} Lint\n`);
          console.log('============================================================\n');

          return await promptUserConfirmation('Create Pull Request?');
        },
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('\n🎉 PUBLISH SUCCESSFUL!');
        console.log(`  Branch Created: ${result.branchName}`);
        console.log(`  Commit Hash:    ${result.commitHash.slice(0, 7)}`);
        if (result.prUrl) {
          console.log(`  Pull Request:   ${result.prUrl}\n`);
        }
      }
    } catch (err: any) {
      if (err instanceof ValidationError && err.message === 'This project already exists in the portfolio.') {
        console.log(`\n${err.message}`);
        console.log('Prompt: Do you want to update the existing project entry? (Use --update flag to overwrite)\n');
        process.exit(0);
      }
      if (err instanceof GitHubApiError) {
        console.error(`\n❌ ${err.message}\n`);
        process.exit(1);
      }
      logger.error('Publish command failed', err);
      process.exit(1);
    }
  });

program
  .command('bot')
  .description('Start Telegram Bot interface listener for Portfolio Publishing Agent')
  .action(async () => {
    try {
      logger.info('Launching Telegram Bot listener...');
      await startTelegramBot();
    } catch (err: any) {
      logger.error('Failed to start Telegram bot', err);
      process.exit(1);
    }
  });

program
  .command('webhook')
  .description('Start GitHub Webhook server listener and proactive Telegram agent')
  .option('-p, --port <port>', 'Port to run webhook HTTP server on', (val) => parseInt(val, 10))
  .action(async (options: { port?: number }) => {
    try {
      logger.info('Launching Telegram Bot listener and GitHub Webhook server...');
      const bot = await startTelegramBot();
      const port = options.port || config.WEBHOOK_PORT;

      await startWebhookServer({
        port,
        onViableProject: async ({ projectName, repoUrl, description }) => {
          logger.info(`[WebhookCommand] Proactive project notification triggered for ${projectName} (${repoUrl})`);
          if (config.TELEGRAM_ALLOWED_USER_ID) {
            await sendProactiveProjectNotification(
              bot,
              config.TELEGRAM_ALLOWED_USER_ID,
              projectName,
              description,
              repoUrl,
              projectName
            );
          }
        },
      });
    } catch (err: any) {
      logger.error('Failed to start Webhook server', err);
      process.exit(1);
    }
  });

program.parse(process.argv);

