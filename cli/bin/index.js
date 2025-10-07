#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import ora from "ora";
import simpleGit from "simple-git";
import { Octokit } from "@octokit/rest";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

// Get the source project root (two levels up from this file)
const SOURCE_ROOT = path.resolve(__dirname, "../..");
const DOCUMENTS_DIR = path.join(os.homedir(), "Documents");

// Files and directories to exclude from copying (precise checks)
const EXCLUDE_DIR_PREFIXES = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  ".cache/",
  "coverage/",
  "cli/node_modules/",
];

const EXCLUDE_BASENAMES = new Set([
  ".DS_Store",
]);

const EXCLUDE_EXACT = new Set([
  ".env",
  ".env.local",
]);

/**
 * Generate case variations of a name
 */
function generateNameVariations(name) {
  // Convert input to different cases
  const pascalCase = name
    .split(/[-_\s]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
  
  const kebabCase = name
    .split(/(?=[A-Z])|[-_\s]/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())
    .join("-");
  
  const snakeCase = kebabCase.replace(/-/g, "_");
  
  const upperSnakeCase = snakeCase.toUpperCase();
  
  const spaceCase = name
    .split(/(?=[A-Z])|[-_\s]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return {
    pascalCase,    // MyNewApp
    kebabCase,     // my-new-app
    snakeCase,     // my_new_app
    upperSnakeCase, // MY_NEW_APP
    spaceCase,     // My New App
  };
}

/**
 * Check if file should be excluded
 */
function shouldExclude(filePath, rootPath) {
  const relativePath = path.relative(rootPath, filePath).replaceAll("\\", "/");
  const relWithSlash = relativePath.endsWith("/") ? relativePath : relativePath + "/";
  const base = path.basename(relativePath);

  // Exclude directory prefixes
  if (EXCLUDE_DIR_PREFIXES.some((p) => relWithSlash.startsWith(p))) return true;

  // Exclude specific basenames
  if (EXCLUDE_BASENAMES.has(base)) return true;

  // Exclude exact matches
  if (EXCLUDE_EXACT.has(relativePath)) return true;

  // Exclude log files strictly by extension
  if (relativePath.toLowerCase().endsWith(".log")) return true;

  return false;
}

/**
 * Check if file is binary
 */
function isBinaryFile(filePath) {
  const binaryExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
  ];
  
  const ext = path.extname(filePath).toLowerCase();
  return binaryExtensions.includes(ext);
}

/**
 * Replace text in file content
 */
function replaceTextInContent(content, newName) {
  const oldVariations = {
    pascalCase: "EcProjectLaunchpad",
    kebabCase: "e-c-project-launchpad",
    snakeCase: "e_c_project_launchpad",
    upperSnakeCase: "E_C_PROJECT_LAUNCHPAD",
    spaceCase: "E C Project Launchpad",
  };
  
  const newVariations = generateNameVariations(newName);
  
  let result = content;
  
  // Replace each variation
  result = result.replace(/EcProjectLaunchpad/g, newVariations.pascalCase);
  result = result.replace(/e-c-project-launchpad/g, newVariations.kebabCase);
  result = result.replace(/e_c_project_launchpad/g, newVariations.snakeCase);
  result = result.replace(/E_C_PROJECT_LAUNCHPAD/g, newVariations.upperSnakeCase);
  result = result.replace(/E C Project Launchpad/g, newVariations.spaceCase);
  
  return result;
}

/**
 * Copy and rebrand project
 */
async function copyAndRebrandProject(sourcePath, destPath, newName, spinner, verbose = false) {
  const files = await fs.readdir(sourcePath, { withFileTypes: true });
  
  for (const file of files) {
    const sourceFilePath = path.join(sourcePath, file.name);
    const destFilePath = path.join(destPath, file.name);
    
    // Skip excluded files
    if (shouldExclude(sourceFilePath, SOURCE_ROOT)) {
      if (verbose) {
        console.log(chalk.dim(`   Skipping: ${path.relative(SOURCE_ROOT, sourceFilePath)}`));
      }
      continue;
    }
    
    try {
      if (file.isDirectory()) {
        if (verbose) {
          console.log(chalk.blue(`   Dir: ${path.relative(SOURCE_ROOT, sourceFilePath)}`));
        }
        await fs.ensureDir(destFilePath);
        await copyAndRebrandProject(sourceFilePath, destFilePath, newName, spinner, verbose);
      } else {
        if (isBinaryFile(sourceFilePath)) {
          // Copy binary files as-is
          if (verbose) {
            console.log(chalk.gray(`   Binary: ${path.relative(SOURCE_ROOT, sourceFilePath)}`));
          }
          await fs.copy(sourceFilePath, destFilePath);
        } else {
          // Read, replace text, and write text files
          try {
            const content = await fs.readFile(sourceFilePath, "utf8");
            const newContent = replaceTextInContent(content, newName);
            await fs.writeFile(destFilePath, newContent, "utf8");
            if (verbose) {
              console.log(chalk.green(`   Text: ${path.relative(SOURCE_ROOT, sourceFilePath)}`));
            }
          } catch (readError) {
            // If UTF-8 read fails, copy as binary
            console.warn(chalk.yellow(`⚠️  Could not read as text, copying as binary: ${path.relative(SOURCE_ROOT, sourceFilePath)}`));
            await fs.copy(sourceFilePath, destFilePath);
          }
        }
      }
    } catch (error) {
      console.error(chalk.red(`❌ Error copying ${path.relative(SOURCE_ROOT, sourceFilePath)}: ${error.message}`));
      throw error;
    }
  }
}

/**
 * Initialize git repository
 */
async function initializeGit(projectPath, spinner) {
  const git = simpleGit(projectPath);
  
  spinner.text = "Initializing git repository...";
  await git.init();
  await git.add(".");
  await git.commit("Initial commit");
  
  return git;
}

/**
 * Create GitHub repository
 */
async function createGitHubRepo(projectName, projectPath, spinner) {
  // Check for GitHub token
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  
  if (!token) {
    spinner.warn(
      chalk.yellow("⚠️  GitHub token not found. Skipping GitHub repo creation.")
    );
    console.log(
      chalk.dim(
        "\nTo enable GitHub repo creation, set GITHUB_TOKEN or GH_TOKEN environment variable."
      )
    );
    console.log(chalk.dim("You can create a token at: https://github.com/settings/tokens\n"));
    return null;
  }
  
  const octokit = new Octokit({ auth: token });
  
  try {
    spinner.text = "Creating GitHub repository...";
    
    // Get authenticated user
    const { data: user } = await octokit.users.getAuthenticated();
    
    // Create repository
    const { data: repo } = await octokit.repos.createForAuthenticatedUser({
      name: projectName,
      private: false,
      auto_init: false,
    });
    
    // Add remote and push
    const git = simpleGit(projectPath);
    await git.addRemote("origin", repo.clone_url);
    await git.push("origin", "main", { "--set-upstream": null });
    
    spinner.succeed(chalk.green(`✅ GitHub repository created: ${repo.html_url}`));
    return repo;
  } catch (error) {
    spinner.warn(chalk.yellow(`⚠️  GitHub repo creation failed: ${error.message}`));
    return null;
  }
}

/**
 * Main create-app command
 */
async function createApp(appName, options) {
  const variations = generateNameVariations(appName);
  const destPath = path.join(DOCUMENTS_DIR, variations.kebabCase);
  
  // Check if destination already exists
  if (await fs.pathExists(destPath)) {
    console.error(chalk.red(`❌ Directory already exists: ${destPath}`));
    console.log(chalk.dim("Please choose a different name or remove the existing directory."));
    process.exit(1);
  }
  
  console.log(chalk.bold.blue(`\n🚀 Creating new app: ${variations.spaceCase}\n`));
  console.log(chalk.dim(`Source: ${SOURCE_ROOT}`));
  console.log(chalk.dim(`Destination: ${destPath}\n`));
  
  if (options.dryRun) {
    console.log(chalk.yellow("🔍 DRY RUN MODE - No files will be created\n"));
    console.log("Would perform the following actions:");
    console.log(`  1. Create directory: ${destPath}`);
    console.log(`  2. Copy and rebrand all files from source`);
    console.log(`  3. Initialize git repository`);
    console.log(`  4. Create GitHub repository (if token available)`);
    console.log(`  5. Push to GitHub\n`);
    return;
  }
  
  const spinner = ora();
  
  try {
    // Step 1: Create destination directory
    spinner.start("Creating project directory...");
    await fs.ensureDir(destPath);
    spinner.succeed(chalk.green("✅ Created project directory"));
    
    // Step 2: Copy and rebrand files
    spinner.start("Copying and rebranding files...");
    if (options.verbose) {
      spinner.stop();
      console.log(chalk.bold("\nCopying files (verbose mode):\n"));
    }
    await copyAndRebrandProject(SOURCE_ROOT, destPath, appName, spinner, options.verbose);
    if (options.verbose) {
      console.log();
    }
    spinner.succeed(chalk.green("✅ Copied and rebranded all files"));
    
    // Step 3: Initialize git
    await initializeGit(destPath, spinner);
    spinner.succeed(chalk.green("✅ Initialized git repository"));
    
    // Step 4: Create GitHub repo and push
    await createGitHubRepo(variations.kebabCase, destPath, spinner);
    
    // Success!
    console.log(chalk.bold.green(`\n✨ Success! Your new app "${variations.spaceCase}" is ready!\n`));
    console.log(chalk.bold("📝 Next steps:\n"));
    console.log(chalk.cyan(`   cd ${destPath}`));
    console.log(chalk.cyan(`   cp .env.example .env`));
    console.log(chalk.cyan(`   # Edit .env with your API keys`));
    console.log(chalk.cyan(`   docker compose up --build -d\n`));
    
    console.log(chalk.dim(`💡 Your project is located at: ${destPath}\n`));
  } catch (error) {
    spinner.fail(chalk.red(`❌ Error: ${error.message}`));
    console.error(error);
    process.exit(1);
  }
}

// CLI setup
program
  .name("e-c-project-launchpad")
  .description("E C Project Launchpad CLI - Create rebranded project scaffolds")
  .version("0.0.1");

program
  .command("create-app <name>")
  .description("Create a new rebranded copy of E C Project Launchpad")
  .option("--dry-run", "Preview actions without creating files")
  .option("-v, --verbose", "Show detailed file copying progress")
  .action(createApp);

// Legacy alias
program
  .command("new <name>")
  .description("Create a new rebranded copy of E C Project Launchpad (alias for create-app)")
  .option("--dry-run", "Preview actions without creating files")
  .option("-v, --verbose", "Show detailed file copying progress")
  .action(createApp);

program.parse();
