import { Module } from "@nestjs/common";
import { WorkspaceService } from "./workspace.service";
import { WorkspaceController } from "./workspace.controller";
import { DataRequestsWorker } from "./data-requests.worker";

@Module({
  providers: [WorkspaceService, DataRequestsWorker],
  controllers: [WorkspaceController],
  exports: [DataRequestsWorker],
})
export class WorkspaceModule {}
