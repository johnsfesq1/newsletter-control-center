export type Email = {
  id: string;           // Gmail message ID
  threadId: string;     // Gmail thread ID
  from: string;         // full "From" header
  fromEmail: string;    // extracted plain email address
  subject: string;
  date: string;         // ISO timestamp
  snippet: string;      // short Gmail preview
  plaintext: string;    // plain-text body (best effort)
  gmailLink: string;    // direct link to open in Gmail
};

export type FetchResult = {
  vip: Email[];
  nonVip: Email[];
};
