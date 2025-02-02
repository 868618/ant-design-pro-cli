const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const glob = require('glob');
const exec = require('execa');
const rimraf = require('rimraf');
const BasicGenerator = require('../../BasicGenerator');
const filterPkg = require('./filterPkg');
const prettier = require('prettier');
const sortPackage = require('sort-package-json');
const { getFastGithub } = require('umi-utils');

function log(...args) {
  console.log(`${chalk.gray('>')}`, ...args);
}

function globList(patternList, options) {
  let fileList = [];
  patternList.forEach((pattern) => {
    fileList = [...fileList, ...glob.sync(pattern, options)];
  });

  return fileList;
}

const getGithubUrl = async () => {
  const fastGithub = await getFastGithub();
  if (fastGithub === 'gitee.com' || fastGithub === 'github.com.cnpmjs.org') {
    return 'git@gitee.com:ant-design/ant-design-pro.git';
  }
  return 'git@github.com:ant-design/ant-design-pro.git';
};

class AntDesignProGenerator extends BasicGenerator {
  prompting() {
    const prompts = [
      {
        name: 'version',
        type: 'list',
        message: '🐂 使用 umi@4 还是 umi@3 ?',
        choices: ['umi@4', 'umi@3'],
        default: 'umi@4',
      },
      {
        name: 'allBlocks',
        type: 'list',
        when: ({ version }) => {
          if (version === 'umi@4') {
            console.log('🧎🏻全量区块暂时不支持 umi@4');
            return false;
          }
          return true;
        },
        message: '🚀 要全量的还是一个简单的脚手架?',
        choices: ['simple', 'complete'],
        default: 'simple',
      },
    ];
    return this.prompt(prompts).then((props) => {
      this.prompts = props;
    });
  }

  async writing() {
    const { allBlocks, version } = this.prompts;

    const projectName = this.opts.name || this.opts.env.cwd;
    const projectPath = path.resolve(projectName);

    const envOptions = {
      cwd: projectPath,
    };

    const githubUrl = await getGithubUrl();
    const gitArgs = [`clone`, githubUrl, `--depth=1`];

    // all-blocks 分支上包含了所有的区块
    if (allBlocks === 'complete') {
      log(`🙈 complete mode can only use the version of antd@4`);
      gitArgs.push('--branch', 'all-blocks');
    } else if (version === 'umi@3') {
      gitArgs.push('--branch', 'umi@3');
    }

    gitArgs.push(projectName);

    // // 没有提供关闭的配置
    // // https://github.com/yeoman/environment/blob/9880bc7d5b26beff9f0b4d5048c672a85ce4bcaa/lib/util/repository.js#L50
    const yoConfigPth = path.join(projectPath, '.yo-repository');
    if (fs.existsSync(yoConfigPth)) {
      // 删除 .yo-repository
      rimraf.sync(yoConfigPth);
    }

    if (
      fs.existsSync(projectPath) &&
      fs.statSync(projectPath).isDirectory() &&
      fs.readdirSync(projectPath).length > 0
    ) {
      console.log('\n');
      console.log(`🙈 请在空文件夹中使用，或者使用 ${chalk.red('yarn create umi myapp')}`);
      console.log(`🙈 Please select an empty folder, or use ${chalk.red('yarn create umi myapp')}`);
      process.exit(1);
    }

    // Clone remote branch
    // log(`git ${[`clone`, githubUrl].join(' ')}`);
    await exec(
      `git`,
      gitArgs,
      process.env.TEST
        ? {}
        : {
            stdout: process.stdout,
            stderr: process.stderr,
            stdin: process.stdin,
          },
    );

    log(`🚚 clone success`);

    const packageJsonPath = path.resolve(projectPath, 'package.json');
    const pkg = require(packageJsonPath);

    // copy readme
    const babelConfig = path.resolve(__dirname, 'README.md');
    fs.copySync(babelConfig, path.resolve(projectPath, 'README.md'));

    // gen package.json
    if (pkg['create-umi']) {
      const { ignoreScript = [], ignoreDependencies = [] } = pkg['create-umi'];
      // filter scripts and devDependencies
      const projectPkg = {
        ...pkg,
        scripts: filterPkg(pkg.scripts, ignoreScript),
        devDependencies: filterPkg(pkg.devDependencies, ignoreDependencies),
      };
      // remove create-umi config
      delete projectPkg['create-umi'];
      fs.writeFileSync(
        path.resolve(projectPath, 'package.json'),
        // 删除一个包之后 json会多了一些空行。sortPackage 可以删除掉并且排序
        // prettier 会容忍一个空行
        prettier.format(JSON.stringify(sortPackage(projectPkg)), {
          parser: 'json',
        }),
      );
    }

    // Clean up useless files
    if (pkg['create-umi'] && pkg['create-umi'].ignore) {
      log('Clean up...');
      const ignoreFiles = pkg['create-umi'].ignore;
      const fileList = globList(ignoreFiles, envOptions);

      fileList.forEach((filePath) => {
        const targetPath = path.resolve(projectPath, filePath);
        fs.removeSync(targetPath);
      });
    }
  }
}

module.exports = AntDesignProGenerator;
