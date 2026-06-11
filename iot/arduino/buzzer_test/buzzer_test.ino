/*
 * Passive buzzer test — pin 3
 * ---------------------------
 * Plays the POS / card-terminal "payment accepted" chime on a loop: a two-tone
 * "dee-doo". A PASSIVE buzzer (piezo) has no oscillator of its own, so we feed
 * it a frequency with tone() — that's what lets us pick the two pitches.
 *
 * Wiring:
 *   Buzzer (+)  ->  D3
 *   Buzzer (-)  ->  GND
 *
 * Open Serial Monitor @ 9600 baud to follow along.
 */

#define BUZZER 3

// Two notes: "dee" (higher) then "doo" (lower) = the classic descending chime.
// For a rising "approved!" feel instead, just swap these two values.
#define NOTE_DEE 2349  // D7
#define NOTE_DOO 1760  // A6

// Play one frequency for `durMs`, then a short gap.
void note(int freq, int durMs, int gapMs) {
  tone(BUZZER, freq, durMs);
  delay(durMs + gapMs);  // tone() is non-blocking, so wait it out ourselves
}

// "dee-doo" payment chime.
void paymentChime() {
  note(NOTE_DEE, 140, 30);
  note(NOTE_DOO, 200, 0);
  noTone(BUZZER);
}

void setup() {
  Serial.begin(9600);
  pinMode(BUZZER, OUTPUT);
  Serial.println("Passive buzzer test on pin 3 — listen for the 'dee-doo'.");
}

void loop() {
  Serial.println("dee-doo (payment accepted)");
  paymentChime();
  delay(2000);  // pause, then chime again so you can judge the sound
}
