import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { DailyWordModule } from './daily-word/daily-word.module';
import { DictationModule } from './dictation/dictation.module';
import { FocusModule } from './focus/focus.module';
import { GrammarModule } from './grammar/grammar.module';
import { ImportModule } from './import/import.module';
import { MatchGameModule } from './match-game/match-game.module';
import { PrismaModule } from './prisma/prisma.module';
import { RootsModule } from './roots/roots.module';
import { SpeakingModule } from './speaking/speaking.module';
import { ClozeModule } from './cloze/cloze.module';
import { StatsModule } from './stats/stats.module';
import { UserWordsModule } from './user-words/user-words.module';
import { WordsModule } from './words/words.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60_000,
          limit: 120
        }
      ]
    }),
    PrismaModule,
    AuthModule,
    WordsModule,
    UserWordsModule,
    GrammarModule,
    DictationModule,
    MatchGameModule,
    ImportModule,
    RootsModule,
    SpeakingModule,
    ClozeModule,
    FocusModule,
    StatsModule,
    DailyWordModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule {}
