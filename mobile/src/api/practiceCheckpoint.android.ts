import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPracticeCheckpointStore } from './practiceCheckpointStore';
export const practiceCheckpoint = createPracticeCheckpointStore(AsyncStorage);
