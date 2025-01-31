/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-ignore
import { packageJson } from 'ember-apply';
import { execa } from 'execa';
import fse from 'fs-extra';
import fs from 'node:fs/promises';
import os from 'node:os';
import path, { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Project {
  rootPath: string;
  /**
   * Default location of the addon
   */
  addonPath: string;
  /**
   * Location of the addon when already in a monorepo or when
   * tests are extracted.
   */
  packagePath: string;
  /**
   * Location of the test app
   */
  testAppPath: string;
}

/**
 * NOTE: these tests *only* use pnpm, becausue npm and yarn are frail
 *       and slow.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

export const binPath = join(__dirname, '..', 'cli', 'bin.js');

export async function adoptFixture(srcLocation: string): Promise<void> {
  let fullLocation = path.join(
    process.env.INIT_CWD ?? process.cwd(),
    srcLocation
  );
  let packageJsonPath = path.join(fullLocation, 'package.json');
  let oldPackageJson = await fse.readJSON(packageJsonPath);
  let { name, version } = oldPackageJson;

  // replacing @ with [at] breaks vitest...
  name = name.replace('@', '').replace('/', '__');

  let destinationPath = path.join(fixturesDir, `${name}-${version}`);

  await fs.cp(fullLocation, destinationPath, { recursive: true });

  await packageJson.modify(async (json: any) => {
    delete json.volta;
  }, path.dirname(destinationPath));
}

export async function findFixtures(): Promise<string[]> {
  return (await fs.readdir(fixturesDir, { withFileTypes: true }))
    .filter((stat) => stat.isDirectory())
    .map((stat) => stat.name);
}

async function createTmpDir(prefix: string) {
  let prefixPath = path.join(os.tmpdir(), prefix);

  let tmpDirPath = await fs.mkdtemp(prefixPath);

  return tmpDirPath;
}

export async function addonFrom(fixture: string): Promise<Project> {
  let fixturePath = path.join(fixturesDir, fixture);
  let tmp = await createTmpDir(fixture);
  let originalPackageJsonPath = path.join(fixturePath, 'package.json');
  let originalPackageJson = await fse.readJSON(originalPackageJsonPath);

  let projectName = originalPackageJson.name;

  await fs.cp(fixturePath, tmp, { recursive: true });

  let project = {
    rootPath: tmp,
    addonPath: path.join(tmp, projectName),
    packagePath: path.join(tmp, 'package'),
    testAppPath: path.join(tmp, 'test-app'),
  };

  await execa('git', ['init'], { cwd: tmp });
  await execa('pnpm', ['install'], { cwd: tmp });

  return project;
}

export async function install(project: Pick<Project, 'rootPath'>) {
  await execa('pnpm', ['install'], {
    cwd: project.rootPath,
  });
}

export async function build(project: Project) {
  let buildResult = await execa('pnpm', ['build'], { cwd: project.addonPath });

  return buildResult;
}

export async function emberTest(project: Pick<Project, 'testAppPath'>) {
  return await execa('pnpm', ['ember', 'test', '--test-port', '0'], {
    cwd: project.testAppPath,
  });
}

export async function lintAddon(project: Project) {
  return await execa('pnpm', ['lint'], { cwd: project.addonPath });
}

export async function lintTestApp(project: Project) {
  return await execa('pnpm', ['lint'], { cwd: project.testAppPath });
}
