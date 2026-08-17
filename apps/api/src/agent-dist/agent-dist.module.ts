import { Module } from "@nestjs/common";
import { AgentDistController } from "./agent-dist.controller";

@Module({
  controllers: [AgentDistController],
})
export class AgentDistModule {}
