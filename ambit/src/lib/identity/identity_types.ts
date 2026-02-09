export type identity_profile_summary = {
  profile_id: string;
  name: string;
  age: number | null;
  interests: string;
  phone_number: string | null;
  sms_consent: boolean;
  sms_consent_at: string | null;
  created_at: string;
  updated_at: string;
  descriptor_count: number;
};

export type identity_enrollment = {
  enrollment_id: string;
  descriptor: number[];
  image_data_url: string | null;
  created_at: string;
};

export type identity_memory = {
  tags: Record<string, string>;
  facts: string[];
  preferences: string[];
  notes: string[];
};

export type identity_conversation_summary = {
  summary_id: string;
  profile_id: string;
  conversation_id: string | null;
  summary: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export type identity_generated_image = {
  image_id: string;
  profile_id: string;
  prompt: string;
  image_data_url: string;
  created_at: string;
};

export type identity_profile = {
  profile_id: string;
  name: string;
  age: number | null;
  interests: string;
  phone_number: string | null;
  sms_consent: boolean;
  sms_consent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type identity_profile_bundle = {
  profile: identity_profile;
  enrollments: identity_enrollment[];
  memory: identity_memory;
  conversation_summaries: identity_conversation_summary[];
};

export type identity_journal_entry = {
  entry_id: string;
  profile_id: string;
  entry_date: string;
  content_html: string;
  content_text: string;
  qa_transcript: Array<{ role: string; content: string }> | null;
  mood: string | null;
  created_at: string;
  updated_at: string;
};

export type identity_journal_entry_summary = {
  entry_id: string;
  entry_date: string;
  mood: string | null;
  updated_at: string;
};

export type journal_movie_segment = {
  text: string;
  image_prompt: string;
  image_data_url: string;
};

export type journal_movie = {
  movie_id: string;
  profile_id: string;
  entry_date: string;
  version: number;
  voice_id: string;
  voice_name: string | null;
  segments_json: string;
  audio_base64: string;
  alignment_json: string;
  status: string;
  created_at: string;
};

export type journal_movie_summary = {
  movie_id: string;
  profile_id: string;
  entry_date: string;
  version: number;
  voice_id: string;
  voice_name: string | null;
  status: string;
  created_at: string;
};

