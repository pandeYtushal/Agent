import { InlineKeyboard } from 'grammy';

export function createProjectActionKeyboard(githubUrl: string): InlineKeyboard {
  const encodedUrl = encodeURIComponent(githubUrl);
  return new InlineKeyboard()
    .text('🚀 Publish', `pub:${encodedUrl}`)
    .text('✏️ Edit', `edit:${encodedUrl}`)
    .text('❌ Cancel', `cancel:${encodedUrl}`);
}

export function createNewProjectDetectedKeyboard(githubUrl: string, repoName: string): InlineKeyboard {
  const encodedUrl = encodeURIComponent(githubUrl);
  const encodedRepo = encodeURIComponent(repoName);
  return new InlineKeyboard()
    .text('🔍 Review', `review:${encodedUrl}`)
    .text('🙈 Ignore', `ignore:${encodedRepo}`);
}

export function createCancelOnlyKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('❌ Cancel', 'cancel:current');
}

export function createRepoCountKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📊 Refresh Count', 'cmd:repos')
    .text('📌 List Projects', 'cmd:projects')
    .row()
    .text('➕ Add Project', 'cmd:add')
    .text('❓ Help', 'cmd:help');
}

export function createMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📊 Repo Count', 'cmd:repos')
    .text('📌 Projects', 'cmd:projects')
    .row()
    .text('➕ Add Repo', 'cmd:add')
    .text('❓ Help', 'cmd:help');
}

