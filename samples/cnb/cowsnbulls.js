/*
 Author: Igor Támara <igor@tamaraptino.org>
 Given to the public domain, no warranties, if you want, do use this
 engine in your sites and if you want, let me know of improvements
 to it.
 This is the logic for playing against the computer cows and bulls
*/

function Attempt(guess, bulls, cows) {
    'use strict';
    this.guess = guess;
    this.cows = cows;
    this.bulls = bulls;
}

function CowsBulls(n_dig) {
    'use strict';
    var self = this;
    self.to_guess = "";
    self.tries = 0;
    self.quantity = n_dig;

    self.new_game = function () {
        // Creates a new game of cows and bulls
        var aux_guess = [], i = 0;
        for (i = 0; i < self.quantity; i += 1) {
            aux_guess.push(Math.floor(Math.random() * 10).toString());
        }
        self.to_guess = aux_guess.join('');
        self.error = '';
        self.history = [];
    };

    self.get_bulls = function (the_guess) {
        // Returns an array of the positions fixed
        var bulls = [], i = 0;
        for (i = 0; i < the_guess.length; i += 1) {
            if (the_guess[i] === self.to_guess[i]) {
                bulls.push(i);
            }
        }
        return bulls;
    };

    self.get_cows = function (the_guess, bulls) {
        // Returns the number of cows
        var clone = self.to_guess.split(""),
            considered = [],
            cows = 0,
            i = 0,
            re,
            r_1,
            r_2;
        for (i = 0; i < bulls.length; i += 1) {
            clone[bulls[i]] = '-';
        }
        clone = clone.join("");
        for (i = 0; i < self.to_guess.length; i += 1) {
            if (considered.indexOf(the_guess[i]) === -1 && bulls.indexOf(i) === -1) {
                re = new RegExp(the_guess[i], 'g');
                r_1 = the_guess.match(re);
                r_2 = clone.match(re);
                if (r_1 !== null && r_2 !== null) {
                    cows += Math.min(r_1.length, r_2.length);
                }
                considered.push(the_guess[i]);
            }
        }
        return cows;
    };

    self.guess = function (the_guess) {
        var bulls, cows;
        // Returns an array telling in the first position the number
        // of bulls and as a second position the number of cows
        if (the_guess.length !== self.to_guess.length) {
            self.error = 'Coloca la misma cantidad';
            return [0, 0];
        }
        self.error = '';
        bulls = self.get_bulls(the_guess);
        if (bulls.length === self.to_guess.length) {
            self.history.push(new Attempt(the_guess, bulls.length, 0));
            return [bulls.length, 0];
        }
        cows = self.get_cows(the_guess, bulls);
        self.error = '';
        self.history.push(new Attempt(the_guess, bulls.length, cows));
        return [bulls.length, cows];
    };

    self.won = function (the_guess) {
        var i;
        // Determines if the game has been won
        if (self.history.length === 0) {
            return false;
        }
        if (the_guess === undefined) {
            the_guess = self.history[self.history.length - 1].guess;
        }
        for (i = 0; i < the_guess.length; i += 1) {
            if (the_guess[i] !== self.to_guess[i]) {
                return false;
            }
        }
        return true;
    };
    self.new_game(n_dig);
}