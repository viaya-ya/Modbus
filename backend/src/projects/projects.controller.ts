import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list() {
    return this.projectsService.listProjects();
  }

  @Post()
  create(@Body() body: { name: string }) {
    return this.projectsService.createProject(body.name);
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

  @Get('active')
  getActive() {
    const id = this.projectsService.getActiveProjectId();
    return { id };
  }

  @Post('active')
  setActive(@Body() body: { id: string | null }) {
    this.projectsService.setActiveProject(body.id);
    return { success: true };
  }
}
