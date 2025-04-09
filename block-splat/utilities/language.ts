// helper functions for generating random death messages
export function getFallingMessage(killed: string) {
  const messages = [
    `${killed} has fallen into the void!`,
    `${killed} slipped on a banana peel!`,
    `${killed} forgot that they couldn't fly!`,
    `${killed} fell off the edge of the world!`,
    `${killed} fell into a bottomless pit!`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

export function getKillingMessage(killer: string, killed: string) {
  const messages = [
    `${killer} sent ${killed} out of this world!`,
    `${killer} threw a paintball right at ${killed}'s face!`,
    `${killer} just introduced ${killed} to the concept of gravity... the hard way.`,
    `${killer} gave ${killed} a free skydiving lesson... without a parachute.`,
    `${killer} just proved that ${killed} was never meant to be an astronaut.`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}
