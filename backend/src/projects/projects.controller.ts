import { Controller, Get, Post, Patch, Delete, Body, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list() {
    return this.projectsService.listProjects();
  }

  @Get('active')
  getActive() {
    const id = this.projectsService.getActiveProjectId();
    return { id };
  }

  @Get('mismatches')
  getMismatches() {
    return this.projectsService.checkMismatches();
  }

  @Get(':id/export')
  export(@Param('id') id: string, @Res() res: Response) {
    const filePath = this.projectsService.getProjectFilePath(id);
    if (!filePath) {
      res.status(404).json({ message: `Проект '${id}' не найден` });
      return;
    }
    res.download(filePath, `${id}.project.json`);
  }

  @Post()
  create(@Body() body: { name: string }) {
    return this.projectsService.createProject(body.name);
  }

  @Post('active')
  setActive(@Body() body: { id: string | null }) {
    this.projectsService.setActiveProject(body.id);
    return { success: true };
  }

  @Post('import')
  importProject(@Body() body: { content: any }) {
    return this.projectsService.importProject(body.content);
  }

  @Post(':folderId/fix-mismatch')
  fixMismatch(
    @Param('folderId') folderId: string,
    @Body() body: { action: 'sync-to-folder' | 'rename-to-content' },
  ) {
    return this.projectsService.fixMismatch(folderId, body.action);
  }

  @Patch(':id')
  rename(@Param('id') id: string, @Body() body: { name: string }) {
    return this.projectsService.renameProject(id, body.name);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.projectsService.deleteProject(id);
    return { success: true };
  }
}
